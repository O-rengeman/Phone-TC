import json
import os
import sys
import time
import socket
import urllib.error
import urllib.request
import traceback
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer # マルチスレッド対応モジュールを追加

TARGET_URL = "https://api.ai.sakura.ad.jp/v1/chat/completions"
API_KEY_ENV = "SAKURA_API_KEY"
ENV_FILE = Path(__file__).with_name(".env")
PORT = 8080
MAX_RETRIES = 3
RETRY_DELAY = 3.0


def load_api_key():
    """
    APIキーを環境変数から取得する。設定されていない場合は、このスクリプトと
    同じフォルダの .env ファイル（SAKURA_API_KEY=...）をフォールバックとして読む。
    キーをソースコードに直接書かないことで、リポジトリへの誤コミットを防ぐ。
    """
    key = os.getenv(API_KEY_ENV, "").strip()
    if key:
        return key

    if ENV_FILE.is_file():
        for raw_line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, _, value = line.partition("=")
            if name.strip() == API_KEY_ENV:
                return value.strip().strip('"').strip("'")

    return ""


SAKURA_API_KEY = load_api_key()

def determine_target_model(req_data):
    if not isinstance(req_data, dict):
        return "preview/Qwen3.6-35B-A3B", "Fallback-InvalidData"
    
    messages = req_data.get("messages", [])
    if not isinstance(messages, list):
        messages = []

    has_tools = "tools" in req_data
    context_length = 0
    for m in messages:
        if isinstance(m, dict):
            if "tool_calls" in m:
                has_tools = True
            c = m.get("content")
            if c: context_length += len(str(c))

    if has_tools:
        return "preview/Kimi-K2.6", "Tool-Agent"
    if context_length > 15000:
        return "gpt-oss-120b", "Heavy-Context"
    if req_data.get("model") in ["gpt-3.5-turbo", "gpt-4o-mini"] or context_length < 1000:
        return "llm-jp-3.1-8x13b-instruct4", "Fast-Chat"
        
    return "preview/Qwen3.6-35B-A3B", "Standard-Coding"

class SakuraProxyHandler(BaseHTTPRequestHandler):
    # CORS対応（VS Codeの仕様対策）
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_POST(self):
        # どんな内部エラーが起きても確実にログを吐き出す絶対防壁
        try:
            self._handle_post()
        except Exception as e:
            sys.stdout.write(f"\n[FATAL ERROR] プロキシ内部でクラッシュが発生しました:\n{traceback.format_exc()}\n")
            try:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(b'Internal Proxy Error')
            except:
                pass

    def _handle_post(self):
        content_length = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(content_length)

        try:
            # 巨大なファイルの特殊文字でパースが死ぬのを防ぐ
            req_data = json.loads(raw_body.decode('utf-8', errors='replace'))
        except json.JSONDecodeError:
            req_data = {}

        target_model, route_reason = determine_target_model(req_data)
        is_stream = req_data.get("stream", False)
        
        sys.stdout.write(f"\n[ROUTING] Task: {route_reason} -> Model: {target_model}\n")
        
        clean_req = {"model": target_model, "stream": is_stream}
        
        for key in ["temperature", "top_p", "max_tokens", "tools", "tool_choice"]:
            if key in req_data:
                clean_req[key] = req_data[key]

        clean_messages = []
        for msg in req_data.get("messages", []):
            if not isinstance(msg, dict): continue
            
            role = msg.get("role", "user")
            clean_msg = {"role": role}
            
            content = msg.get("content")
            if content is not None:
                clean_msg["content"] = content
                
            if role == "tool" and (not content or (isinstance(content, str) and content.strip() == "")):
                clean_msg["content"] = "Action completed successfully."
                
            if "tool_calls" in msg: 
                clean_msg["tool_calls"] = msg["tool_calls"]
                if role == "assistant" and (clean_msg.get("content") == "" or clean_msg.get("content") is None):
                    clean_msg.pop("content", None)
                    
            if "tool_call_id" in msg: clean_msg["tool_call_id"] = msg["tool_call_id"]
            if "name" in msg: clean_msg["name"] = msg["name"]
                
            clean_messages.append(clean_msg)
        
        clean_req["messages"] = clean_messages
        payload = json.dumps(clean_req).encode('utf-8')

        for attempt in range(MAX_RETRIES + 1):
            req = urllib.request.Request(TARGET_URL, data=payload, method="POST")
            req.add_header("Content-Type", "application/json")
            req.add_header("Authorization", f"Bearer {SAKURA_API_KEY}")

            try:
                with urllib.request.urlopen(req, timeout=600) as resp:
                    content_type = resp.headers.get("Content-Type", "")
                    
                    if "application/json" in content_type:
                        body = resp.read()
                        resp_data = json.loads(body.decode('utf-8'))
                        
                        if "choices" in resp_data and len(resp_data["choices"]) > 0:
                            msg = resp_data["choices"][0].get("message", {})
                            msg.pop("reasoning", None)
                            if not msg.get("content") and not msg.get("tool_calls"):
                                msg["content"] = "処理が完了しました。"
                                
                        clean_body = json.dumps(resp_data).encode("utf-8")
                        self.send_response(resp.status)
                        self.send_header("Content-Type", "application/json")
                        self.send_header("Content-Length", str(len(clean_body)))
                        self.end_headers()
                        self.wfile.write(clean_body)
                        return
                    else:
                        self.send_response(resp.status)
                        self.send_header("Content-Type", "text/event-stream")
                        self.send_header("Cache-Control", "no-cache")
                        self.send_header("Connection", "close")
                        self.end_headers()

                        has_streamed_content = False

                        while True:
                            line = resp.readline()
                            if not line: break

                            line_str = line.decode("utf-8", errors="replace").strip()
                            if line_str.startswith("data: "):
                                json_str = line_str[6:].strip()
                                
                                if json_str == "[DONE]":
                                    self.wfile.write(b"data: [DONE]\n\n")
                                    self.wfile.flush()
                                    sys.stdout.write(" [DONE]\n")
                                    break

                                try:
                                    chunk_data = json.loads(json_str)
                                    if not chunk_data.get("choices"):
                                        self.wfile.write((f"data: {json.dumps(chunk_data)}\n\n").encode("utf-8"))
                                        self.wfile.flush()
                                        continue
                                        
                                    choice = chunk_data["choices"][0]
                                    delta = choice.get("delta", {})
                                    delta.pop("reasoning", None)
                                    
                                    clean_delta = {}
                                    if "role" in delta: clean_delta["role"] = delta["role"]
                                    if "content" in delta and delta["content"] is not None: 
                                        clean_delta["content"] = delta["content"]
                                        if delta["content"]: has_streamed_content = True
                                    if "tool_calls" in delta: 
                                        clean_delta["tool_calls"] = delta["tool_calls"]
                                        has_streamed_content = True

                                    finish_reason = choice.get("finish_reason")
                                    if finish_reason == "stop" and not has_streamed_content:
                                        clean_delta["content"] = "タスクが完了しました。"
                                        has_streamed_content = True

                                    clean_choice = {
                                        "index": choice.get("index", 0),
                                        "delta": clean_delta,
                                        "finish_reason": finish_reason
                                    }

                                    clean_chunk = {
                                        "id": chunk_data.get("id", "chatcmpl-proxy"),
                                        "object": "chat.completion.chunk",
                                        "created": chunk_data.get("created", 0),
                                        "model": target_model,
                                        "choices": [clean_choice]
                                    }

                                    self.wfile.write((f"data: {json.dumps(clean_chunk)}\n\n").encode("utf-8"))
                                    self.wfile.flush()
                                    sys.stdout.write(".")
                                    sys.stdout.flush()

                                except json.JSONDecodeError:
                                    pass

                        sys.stdout.write("\nStream Complete.\n")
                        return

            except socket.timeout:
                if attempt < MAX_RETRIES:
                    sys.stdout.write(f"\n[TIMEOUT] タイムアウト。再試行... ({attempt+1}/{MAX_RETRIES})\n")
                    time.sleep(RETRY_DELAY)
                    continue
                self.send_response(504)
                self.end_headers()
                self.wfile.write(b'Gateway Timeout')
                return

            except urllib.error.HTTPError as e:
                err_body = e.read().decode('utf-8', errors='replace')
                if e.code == 429 and attempt < MAX_RETRIES:
                    sys.stdout.write(f"\n[RATE LIMIT] 429待機中... ({attempt+1}/{MAX_RETRIES})\n")
                    time.sleep(RETRY_DELAY)
                    continue 
                
                sys.stdout.write(f"\n[API REJECTED] HTTP {e.code}\nReason: {err_body}\n")
                self.send_response(e.code)
                self.end_headers()
                self.wfile.write(err_body.encode('utf-8'))
                return

if __name__ == "__main__":
    if not SAKURA_API_KEY:
        print(
            f"[ERROR] APIキーが設定されていません。\n"
            f"  次のいずれかの方法で {API_KEY_ENV} を設定してから再実行してください。\n"
            f"    PowerShell : $env:{API_KEY_ENV} = 'your-key'\n"
            f"    cmd        : set {API_KEY_ENV}=your-key\n"
            f"    .env ファイル: {ENV_FILE} に  {API_KEY_ENV}=your-key  と記述\n"
        )
        sys.exit(1)

    # シングルスレッドからマルチスレッド（ThreadingHTTPServer）に変更
    server = ThreadingHTTPServer(("127.0.0.1", PORT), SakuraProxyHandler)
    print(f"Sakura AI Bulletproof Proxy listening on http://127.0.0.1:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nProxy stopped.")