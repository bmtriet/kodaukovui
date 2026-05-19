use std::fs;

use serde::{Deserialize, Serialize};

use crate::{
    actions::{BuiltinAction, AI_PROMPT_ID, IMAGE_ASK_ID},
    native,
    settings::{AppState, SettingsSnapshot},
};

const ADD_VIETNAMESE_MARKS_ID: &str = "add-vietnamese-marks";
const TRANSLATE_ENGLISH_ID: &str = "translate-to-english";
const TRANSLATE_VIETNAMESE_ID: &str = "translate-to-vietnamese";
const TRANSLATE_ZH_TW_ID: &str = "translate-to-zh-tw";
const TRANSLATE_KHMER_ID: &str = "translate-to-khmer";

const QUICK_TRANSLATE_SECTION: &str = "quick_translate";
const AI_TOOLS_SECTION: &str = "ai_tools";
const TEXT_TOOLS_SECTION: &str = "text_tools";
const OTHER_ACTIONS_SECTION: &str = "other_actions";

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct LauncherState {
    pub last_used_translation_action_id: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct PopupContext {
    pub has_selected_text: bool,
    pub has_clipboard_image: bool,
    pub has_clipboard_text: bool,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct PopupPayload {
    pub context: PopupContext,
    pub sections: Vec<PopupSection>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PopupSection {
    pub id: String,
    pub items: Vec<PopupItem>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PopupItem {
    pub id: String,
    pub label: String,
    pub short_label: Option<String>,
    pub shortcut: String,
    pub category: String,
    pub context_tags: Vec<String>,
    pub priority_base: i32,
    pub run_mode: String,
    pub kind: Option<String>,
    pub is_builtin: bool,
    pub ask_before_run: bool,
    pub return_with_source: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum Category {
    Translate,
    Ai,
    Text,
    Image,
    Other,
}

#[derive(Clone, Debug)]
struct RankedPopupItem {
    item: PopupItem,
    category: Category,
    score: i32,
}

pub fn build_popup_payload(
    settings_state: &AppState,
    snapshot: &SettingsSnapshot,
    target_window_id: Option<&str>,
) -> (PopupPayload, String) {
    let _ = target_window_id;
    let selected_text = native::copy_selected_text_fast().unwrap_or_default();
    let captured = selected_text.clone();
    let has_selected_text = !selected_text.trim().is_empty();
    let (has_clipboard_image, has_clipboard_text) = if has_selected_text {
        (false, false)
    } else {
        (
            native::read_clipboard_image().ok().flatten().is_some(),
            native::clipboard_has_text(),
        )
    };

    let context = PopupContext {
        has_selected_text,
        has_clipboard_image,
        has_clipboard_text,
    };
    let launcher_state = read_launcher_state(settings_state);
    let ranked_items = rank_items(snapshot, &context, &launcher_state);
    let sections = build_sections(ranked_items, &context, &launcher_state);

    (PopupPayload { context, sections }, captured)
}

pub fn note_translation_action(settings_state: &AppState, action_id: &str) {
    if !is_translation_action(action_id) {
        return;
    }
    let mut state = read_launcher_state(settings_state);
    state.last_used_translation_action_id = Some(action_id.to_string());
    write_launcher_state(settings_state, &state);
}

pub fn is_translation_action(action_id: &str) -> bool {
    matches!(
        action_id,
        TRANSLATE_ENGLISH_ID | TRANSLATE_VIETNAMESE_ID | TRANSLATE_ZH_TW_ID | TRANSLATE_KHMER_ID
    )
}

fn rank_items(
    snapshot: &SettingsSnapshot,
    context: &PopupContext,
    launcher_state: &LauncherState,
) -> Vec<RankedPopupItem> {
    let smart_items = snapshot.smart_actions.iter().filter(|action| action.enabled).map(|action| {
        let category = smart_action_category(action.id.as_str());
        let base = priority_base(action.id.as_str(), &category);
        build_ranked_item(
            PopupItem {
                id: action.id.clone(),
                label: action.name.clone(),
                short_label: short_label(action.id.as_str()),
                shortcut: action.hotkey.clone(),
                category: category_name(&category).to_string(),
                context_tags: context_tags(&category),
                priority_base: base,
                run_mode: if action.ask_before_run {
                    "prompt".to_string()
                } else {
                    "direct".to_string()
                },
                kind: None,
                is_builtin: false,
                ask_before_run: action.ask_before_run,
                return_with_source: action.return_with_source,
            },
            category,
            context,
            launcher_state,
        )
    });

    let builtin_items = snapshot.builtin_actions.iter().filter(|action| action.enabled).map(|action| {
        let category = builtin_action_category(action);
        let base = priority_base(action.id.as_str(), &category);
        build_ranked_item(
            PopupItem {
                id: action.id.clone(),
                label: action.name.clone(),
                short_label: short_label(action.id.as_str()),
                shortcut: action.hotkey.clone(),
                category: category_name(&category).to_string(),
                context_tags: context_tags(&category),
                priority_base: base,
                run_mode: "prompt".to_string(),
                kind: Some(action.kind.clone()),
                is_builtin: true,
                ask_before_run: false,
                return_with_source: false,
            },
            category,
            context,
            launcher_state,
        )
    });

    smart_items.chain(builtin_items).collect()
}

fn build_ranked_item(
    item: PopupItem,
    category: Category,
    context: &PopupContext,
    launcher_state: &LauncherState,
) -> RankedPopupItem {
    let mut score = item.priority_base;

    if context.has_selected_text {
        score += match category {
            Category::Translate => 100,
            Category::Text => 80,
            Category::Ai => 50,
            Category::Image => -30,
            Category::Other => 0,
        };
    } else if context.has_clipboard_image {
        score += match category {
            Category::Image => 100,
            Category::Ai => 80,
            Category::Translate => -20,
            Category::Text => -10,
            Category::Other => 0,
        };
    } else {
        score += match category {
            Category::Ai => 80,
            Category::Image => 40,
            Category::Translate => 10,
            Category::Text => 0,
            Category::Other => 0,
        };
    }

    if context.has_selected_text
        && launcher_state
            .last_used_translation_action_id
            .as_deref()
            == Some(item.id.as_str())
        && category == Category::Translate
    {
        score += 500;
    }

    RankedPopupItem {
        item,
        category,
        score,
    }
}

fn build_sections(
    ranked_items: Vec<RankedPopupItem>,
    context: &PopupContext,
    launcher_state: &LauncherState,
) -> Vec<PopupSection> {
    let mut translation_items: Vec<RankedPopupItem> = ranked_items
        .iter()
        .filter(|item| item.category == Category::Translate)
        .cloned()
        .collect();
    let mut ai_items: Vec<RankedPopupItem> = ranked_items
        .iter()
        .filter(|item| is_ai_tools_item(item))
        .cloned()
        .collect();
    let mut text_items: Vec<RankedPopupItem> = ranked_items
        .iter()
        .filter(|item| item.category == Category::Text && item.item.id != ADD_VIETNAMESE_MARKS_ID)
        .cloned()
        .collect();
    let mut other_items: Vec<RankedPopupItem> = ranked_items
        .iter()
        .filter(|item| {
            item.category == Category::Other
                || (item.category == Category::Ai && !is_ai_tools_item(item))
                || (item.category == Category::Image && !is_ai_tools_item(item))
        })
        .cloned()
        .collect();

    sort_translation_items(&mut translation_items, context, launcher_state);
    sort_ranked_items(&mut ai_items);
    sort_ranked_items(&mut text_items);
    sort_ranked_items(&mut other_items);

    let mut sections = vec![
        build_section(QUICK_TRANSLATE_SECTION, translation_items),
        build_section(AI_TOOLS_SECTION, ai_items),
        build_section(TEXT_TOOLS_SECTION, text_items),
        build_section(OTHER_ACTIONS_SECTION, other_items),
    ];
    sections.retain(|section| !section.items.is_empty());
    sections.sort_by(|left, right| {
        let right_score = top_score(right.id.as_str(), &ranked_items);
        let left_score = top_score(left.id.as_str(), &ranked_items);
        right_score
            .cmp(&left_score)
            .then_with(|| section_order(left.id.as_str()).cmp(&section_order(right.id.as_str())))
    });
    sections
}

fn build_section(id: &str, items: Vec<RankedPopupItem>) -> PopupSection {
    PopupSection {
        id: id.to_string(),
        items: items.into_iter().map(|item| item.item).collect(),
    }
}

fn sort_ranked_items(items: &mut [RankedPopupItem]) {
    items.sort_by(|left, right| {
        right
            .score
            .cmp(&left.score)
            .then_with(|| left.item.label.cmp(&right.item.label))
    });
}

fn sort_translation_items(
    items: &mut [RankedPopupItem],
    context: &PopupContext,
    launcher_state: &LauncherState,
) {
    items.sort_by(|left, right| {
        translation_priority(left.item.id.as_str(), context, launcher_state)
            .cmp(&translation_priority(right.item.id.as_str(), context, launcher_state))
    });
}

fn translation_priority(
    action_id: &str,
    context: &PopupContext,
    launcher_state: &LauncherState,
) -> i32 {
    if context.has_selected_text
        && launcher_state
            .last_used_translation_action_id
            .as_deref()
            == Some(action_id)
    {
        return -1000;
    }
    match action_id {
        TRANSLATE_ENGLISH_ID => 0,
        TRANSLATE_VIETNAMESE_ID => 1,
        TRANSLATE_ZH_TW_ID => 2,
        TRANSLATE_KHMER_ID => 3,
        _ => 99,
    }
}

fn top_score(section_id: &str, ranked_items: &[RankedPopupItem]) -> i32 {
    ranked_items
        .iter()
        .filter(|item| match section_id {
            QUICK_TRANSLATE_SECTION => item.category == Category::Translate,
            AI_TOOLS_SECTION => is_ai_tools_item(item),
            TEXT_TOOLS_SECTION => {
                item.category == Category::Text && item.item.id != ADD_VIETNAMESE_MARKS_ID
            }
            OTHER_ACTIONS_SECTION => {
                item.category == Category::Other
                    || (item.category == Category::Ai && !is_ai_tools_item(item))
                    || (item.category == Category::Image && !is_ai_tools_item(item))
            }
            _ => false,
        })
        .map(|item| item.score)
        .max()
        .unwrap_or(i32::MIN)
}

fn section_order(section_id: &str) -> i32 {
    match section_id {
        QUICK_TRANSLATE_SECTION => 0,
        AI_TOOLS_SECTION => 1,
        TEXT_TOOLS_SECTION => 2,
        OTHER_ACTIONS_SECTION => 3,
        _ => 9,
    }
}

fn is_ai_tools_item(item: &RankedPopupItem) -> bool {
    item.item.id == ADD_VIETNAMESE_MARKS_ID
        || item.item.id == AI_PROMPT_ID
        || item.item.id == IMAGE_ASK_ID
}

fn smart_action_category(action_id: &str) -> Category {
    match action_id {
        TRANSLATE_ENGLISH_ID | TRANSLATE_VIETNAMESE_ID | TRANSLATE_ZH_TW_ID | TRANSLATE_KHMER_ID => {
            Category::Translate
        }
        ADD_VIETNAMESE_MARKS_ID => Category::Text,
        _ => Category::Other,
    }
}

fn builtin_action_category(action: &BuiltinAction) -> Category {
    match action.id.as_str() {
        AI_PROMPT_ID => Category::Ai,
        IMAGE_ASK_ID => Category::Image,
        _ => Category::Other,
    }
}

fn category_name(category: &Category) -> &'static str {
    match category {
        Category::Translate => "translate",
        Category::Ai => "ai",
        Category::Text => "text",
        Category::Image => "image",
        Category::Other => "other",
    }
}

fn context_tags(category: &Category) -> Vec<String> {
    match category {
        Category::Translate | Category::Text => {
            vec!["selectedText".to_string(), "general".to_string()]
        }
        Category::Image => vec!["clipboardImage".to_string(), "general".to_string()],
        Category::Ai | Category::Other => vec!["general".to_string()],
    }
}

fn priority_base(action_id: &str, category: &Category) -> i32 {
    match action_id {
        TRANSLATE_ENGLISH_ID => 30,
        TRANSLATE_VIETNAMESE_ID => 20,
        TRANSLATE_ZH_TW_ID => 10,
        TRANSLATE_KHMER_ID => 0,
        ADD_VIETNAMESE_MARKS_ID => 45,
        AI_PROMPT_ID => 30,
        IMAGE_ASK_ID => 20,
        _ => match category {
            Category::Translate => 0,
            Category::Ai => 10,
            Category::Text => 5,
            Category::Image => 0,
            Category::Other => 0,
        },
    }
}

fn short_label(action_id: &str) -> Option<String> {
    match action_id {
        TRANSLATE_ENGLISH_ID => Some("English".to_string()),
        TRANSLATE_VIETNAMESE_ID => Some("Vietnamese".to_string()),
        TRANSLATE_ZH_TW_ID => Some("Chinese".to_string()),
        TRANSLATE_KHMER_ID => Some("Khmer".to_string()),
        AI_PROMPT_ID => Some("AI Prompt".to_string()),
        IMAGE_ASK_ID => Some("Ask by Image".to_string()),
        ADD_VIETNAMESE_MARKS_ID => Some("Them dau".to_string()),
        _ => None,
    }
}

fn read_launcher_state(settings_state: &AppState) -> LauncherState {
    let path = launcher_state_path(settings_state);
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn write_launcher_state(settings_state: &AppState, state: &LauncherState) {
    let path = launcher_state_path(settings_state);
    if let Err(err) = fs::create_dir_all(settings_state.data_dir()) {
        eprintln!("[LAUNCHER] Failed to create data dir: {err}");
        return;
    }
    match serde_json::to_string_pretty(state) {
        Ok(raw) => {
            if let Err(err) = fs::write(path, raw) {
                eprintln!("[LAUNCHER] Failed to write launcher_state.json: {err}");
            }
        }
        Err(err) => eprintln!("[LAUNCHER] Failed to serialize launcher state: {err}"),
    }
}

fn launcher_state_path(settings_state: &AppState) -> std::path::PathBuf {
    settings_state.data_dir().join("launcher_state.json")
}
