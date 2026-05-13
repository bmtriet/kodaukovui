import tkinter as tk
from tkinterweb import HtmlFrame

html = """
<html>
<head>
<style>
  body { font-family: sans-serif; background-color: #ffffff; padding: 20px; color: #333; }
  h2 { color: #0d7a8a; }
  textarea { width: 100%; height: 80px; border: 1px solid #ccc; padding: 5px; }
  select { padding: 5px; }
  button { padding: 8px 15px; background-color: #0d7a8a; color: white; border: none; cursor: pointer; }
</style>
</head>
<body>
  <h2>KoDauKoVui</h2>
  <label>Nhập yêu cầu cho AI (Prompt):</label><br><br>
  <textarea id="prompt">Nhập câu hỏi hoặc yêu cầu của bạn...</textarea><br><br>
  <label>Ngôn ngữ trả lời:</label>
  <select id="lang">
    <option>🌐 Auto</option>
    <option>🇻🇳 VI</option>
    <option>🇬🇧 EN</option>
    <option>🇹🇼 ZH-tw</option>
  </select>
  <br><br>
  <button id="submit">✈ Gửi (Enter)</button>
</body>
</html>
"""

root = tk.Tk()
root.geometry("600x400")
frame = HtmlFrame(root)
frame.load_html(html)
frame.pack(fill="both", expand=True)
root.after(3000, root.destroy)
root.mainloop()
