pub const SOURCE_SEPARATOR: &str = "\n\n---\nSource:\n";

pub fn build_smart_action_prompt(
    brain_ctx: &str,
    selected_text: &str,
    action_prompt: &str,
    extra_instruction: &str,
) -> String {
    let mut sections = Vec::new();
    push_trimmed(&mut sections, brain_ctx);
    push_trimmed(&mut sections, action_prompt);
    if !extra_instruction.trim().is_empty() {
        sections.push(format!(
            "[ADDITIONAL USER INSTRUCTION]\n{}\n[END ADDITIONAL USER INSTRUCTION]",
            extra_instruction.trim()
        ));
    }
    sections.push(
        "Hãy làm theo đúng hướng dẫn ở trên. Nếu không có yêu cầu khác trong prompt, chỉ trả về kết quả cuối cùng."
            .to_string(),
    );
    sections.push(format!(
        "[SELECTED TEXT]\n{}\n[END SELECTED TEXT]",
        selected_text
    ));
    sections.join("\n\n")
}

pub fn build_ai_prompt_first_turn(
    brain_ctx: &str,
    selected_text: &str,
    user_instruction: &str,
) -> String {
    let mut sections = Vec::new();
    push_trimmed(&mut sections, brain_ctx);
    if selected_text.trim().is_empty() {
        sections.push(
            "You are a helpful AI assistant. Answer the user's request directly, naturally, and with practical detail when useful."
                .to_string(),
        );
    } else {
        sections.push(
            "You are a helpful AI assistant. Use the selected text below as the core working context for the discussion. Answer the user's request directly and naturally."
                .to_string(),
        );
        sections.push(format!(
            "[SELECTED TEXT]\n{}\n[END SELECTED TEXT]",
            selected_text
        ));
    }
    sections.push(format!(
        "[USER REQUEST]\n{}\n[END USER REQUEST]",
        user_instruction.trim()
    ));
    sections.join("\n\n")
}

pub fn build_image_question_prompt(brain_ctx: &str, question: &str) -> String {
    let mut sections = Vec::new();
    push_trimmed(&mut sections, brain_ctx);
    sections.push(
        "Bạn là trợ lý AI phân tích hình ảnh. Hãy dùng cả ngữ cảnh hình ảnh, bố cục UI/screenshot và mọi chữ nhìn thấy trong ảnh để trả lời đúng câu hỏi của người dùng. Không chỉ chép lại hoặc dịch văn bản trong ảnh, trừ khi người dùng yêu cầu rõ như vậy."
            .to_string(),
    );
    sections.push(format!(
        "[USER QUESTION]\n{}\n[END USER QUESTION]",
        question.trim()
    ));
    sections.join("\n\n")
}

fn push_trimmed(sections: &mut Vec<String>, value: &str) {
    let trimmed = value.trim();
    if !trimmed.is_empty() {
        sections.push(trimmed.to_string());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn smart_prompt_includes_source_text() {
        let prompt = build_smart_action_prompt("brain", "xin chao", "add marks", "formal");
        assert!(prompt.contains("[SELECTED TEXT]\nxin chao\n[END SELECTED TEXT]"));
        assert!(prompt.contains("[ADDITIONAL USER INSTRUCTION]\nformal"));
    }

    #[test]
    fn smart_prompt_without_brain_context() {
        let prompt = build_smart_action_prompt("", "hello world", "translate", "");
        assert!(!prompt.contains("[AI BRAIN CONTEXT]"));
        assert!(prompt.contains("[SELECTED TEXT]\nhello world"));
        assert!(prompt.contains("translate"));
    }

    #[test]
    fn smart_prompt_no_extra_instruction() {
        let prompt = build_smart_action_prompt("brain", "text", "do something", "");
        assert!(!prompt.contains("[ADDITIONAL USER INSTRUCTION]"));
    }

    #[test]
    fn ai_prompt_first_turn_with_text() {
        let prompt = build_ai_prompt_first_turn("brain ctx", "selected text here", "tell me about this");
        assert!(prompt.contains("brain ctx"));
        assert!(prompt.contains("[SELECTED TEXT]\nselected text here"));
        assert!(prompt.contains("[USER REQUEST]\ntell me about this"));
        assert!(prompt.contains("core working context"));
    }

    #[test]
    fn ai_prompt_first_turn_without_text() {
        let prompt = build_ai_prompt_first_turn("", "", "hello");
        assert!(!prompt.contains("[SELECTED TEXT]"));
        assert!(prompt.contains("[USER REQUEST]\nhello"));
        assert!(prompt.contains("Answer the user's request directly"));
    }

    #[test]
    fn image_question_prompt() {
        let prompt = build_image_question_prompt("brain ctx", "what is in this image?");
        assert!(prompt.contains("brain ctx"));
        assert!(prompt.contains("phân tích hình ảnh"));
        assert!(prompt.contains("[USER QUESTION]\nwhat is in this image?"));
    }

    #[test]
    fn source_separator_is_defined() {
        assert!(SOURCE_SEPARATOR.contains("---"));
        assert!(SOURCE_SEPARATOR.contains("Source"));
    }
}
