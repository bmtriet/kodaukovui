# Build KoDauKoVui on Windows

Tài liệu này bám theo repo hiện tại:

- UI React build ra `webui/dist/`
- PyInstaller dùng [`kodaukovui.spec`](/home/sgvg-gmo050/Desktop/VibeCode/kodaukovui/kodaukovui.spec:1)
- output là bản `one-folder`, không phải `one-file`

## 1. Prerequisites

Cài sẵn trên máy Windows:

- Python 3.10+ với `py` launcher
- Node.js 20+ và `npm`
- Microsoft Edge WebView2 Runtime

Kiểm tra nhanh trong PowerShell:

```powershell
py -3 --version
node --version
npm --version
```

Nếu `npm` chưa có, cài Node.js trước rồi mới build UI.

## 2. Chuẩn bị source

Mở PowerShell tại thư mục repo:

```powershell
cd C:\path\to\kodaukovui
```

Tạo virtualenv riêng cho build:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt pyinstaller
```

Lý do dùng `.venv`: script [`build_windows.bat`](/home/sgvg-gmo050/Desktop/VibeCode/kodaukovui/build_windows.bat:1) hiện cài thẳng vào `py -3` global interpreter.

## 3. Build Web UI

```powershell
cd .\webui
npm install
npm run build
cd ..
```

Sau bước này phải có file:

```powershell
Test-Path .\webui\dist\index.html
```

Kết quả mong đợi: `True`

## 4. Build EXE

Chạy trong root repo:

```powershell
python -m PyInstaller --noconfirm kodaukovui.spec
```

Hoặc nếu muốn dùng script sẵn có của repo:

```powershell
build_windows.bat
```

Kết quả build:

- `dist\KoDauKoVui\KoDauKoVui.exe`

## 5. File nào được đóng gói

Theo spec hiện tại, bundle sẽ mang theo:

- `icons/`
- `webui/dist/`
- `.env.example` nếu file tồn tại
- `brain.md` nếu file tồn tại

Tham chiếu: [`kodaukovui.spec`](/home/sgvg-gmo050/Desktop/VibeCode/kodaukovui/kodaukovui.spec:6)

## 6. Chuẩn bị cấu hình runtime

App đọc `.env` nằm cạnh executable/runtime folder. Lần đầu chạy, copy từ `.env.example`:

```powershell
Copy-Item .\.env.example .\.env
notepad .\.env
```

Ít nhất phải điền một trong hai:

- `GEMINI_API_KEY`
- `OPENAI_API_KEY`

Lưu ý: `.env.example` hiện chỉ có sẵn biến Gemini, nên nếu muốn dùng OpenAI bạn phải tự thêm:

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini
OPENAI_API_BASE=https://api.openai.com/v1
```

Khi phát hành cho người dùng cuối, giữ `.env` cạnh `KoDauKoVui.exe`.

## 7. Chạy thử bản build

```powershell
cd .\dist\KoDauKoVui
.\KoDauKoVui.exe
```

Nên verify các điểm sau:

1. Console app mở được, không lỗi thiếu module.
2. Popup/QA UI hiện được.
3. Hotkey hoạt động với app thường như Notepad.
4. Thử với app chạy `Run as administrator` để xác nhận thông báo chặn đúng như thiết kế.

## 8. Cấu trúc output mong đợi

```text
dist\
  KoDauKoVui\
    KoDauKoVui.exe
    _internal\...
```

Ngoài ra trong lúc chạy app sẽ tạo hoặc dùng thêm các file cạnh exe:

- `.env`
- `history.json`
- `learned.json`
- `brain.md` nếu người dùng tự thêm/chỉnh

## 9. Troubleshooting

### `Missing webui\dist\index.html`

Bạn chưa chạy `npm run build` trong `webui/`.

### `py` not found

Python chưa được cài đúng cách hoặc chưa có Python Launcher. Cài lại Python và bật tùy chọn thêm launcher.

### `npm` not found

Node.js chưa được cài hoặc chưa reopen terminal sau khi cài.

### UI mở lỗi trắng / không render

Kiểm tra lại WebView2 Runtime và build lại `webui/dist`.

### Hotkey/paste không tác dụng trên app chạy Administrator

Đây là giới hạn đã được code xử lý trên Windows, không phải lỗi build.

## 10. Quy trình ngắn gọn

```powershell
cd C:\path\to\kodaukovui
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt pyinstaller
cd .\webui
npm install
npm run build
cd ..
python -m PyInstaller --noconfirm kodaukovui.spec
Copy-Item .\.env.example .\dist\KoDauKoVui\.env
notepad .\dist\KoDauKoVui\.env
.\dist\KoDauKoVui\KoDauKoVui.exe
```
