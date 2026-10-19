#!/bin/bash
# restore-claude-3p-cu-browser.sh
#
# 恢复 Claude Desktop 在公司 API（3p / custom-3p）模式下不可用的：
#   - In-App Computer Use（gate 4293378213 / 36693946）
#   - In-App Browser Use / 内置浏览器（gate 17519066 / 3990395613）
#   - 本地界面原生语言菜单的简体中文选项（内嵌词表，不强制切换语言）
#
# 原理：3p 模式且未配置 bootstrapUrl 时，GrowthBook 特性源为 static，只加载
# 最小静态表（不含 CU/浏览器 gate）。本脚本兼容旧静态表与 2.42304.0 的
# 规则注册表，补齐主进程与渲染器的 gate。纯本地代码恢复，不修改账号与网络。
#
# 完整流程（macOS）：
#   1. 从原始备份读取 app.asar，修补目标 JS chunk（正则定位，容忍混淆改名）
#   2. 以"字节拼接"方式重建 asar：仅替换目标 chunk，其余字节原样保留；
#      重算 chunk 的 SHA-256/分块哈希与后续文件偏移，并做全文件哈希自检
#   3. 计算新的 asar 头 JSON 哈希，等长替换包内所有 Info.plist 的
#      ElectronAsarIntegrity 值（Electron asar 完整性 fuse 校验的就是它）
#   4. 逐组件保留 JIT/runtime 等权限，移除官方身份绑定后 ad-hoc 重签名
#   5. 重启 Claude；特性数仅供诊断，CU/浏览器仍需在界面中验证
#
# 依赖：python3、Bun、codesign（Xcode CLT）
# 注意：
#   - 应用自动更新会还原官方 asar，之后重新运行本脚本即可（幂等）
#   - 备份保存在 ~/Library/Application Support/Claude-3p/app.asar.orig-<版本>
#   - 回滚：bash restore-claude-3p-cu-browser.sh --restore
#   - 安装器调用 --install [Claude.app 路径]：运行中的应用跳过，完成后不启动应用

set -euo pipefail

APP="/Applications/Claude.app"
MODE="${1:-}"
case "$MODE" in
  --install|--restore) APP="${2:-$APP}" ;;
esac
ASAR="$APP/Contents/Resources/app.asar"
MAIN_PLIST="$APP/Contents/Info.plist"
USER_DATA_3P="$HOME/Library/Application Support/Claude-3p"

die() { echo "ERROR: $*" >&2; exit 1; }
if [[ "$MODE" == "--install" ]]; then
  [[ -f "$ASAR" ]] || { echo "==> Claude Desktop 未安装，跳过增强"; exit 0; }
  if pgrep -x Claude >/dev/null; then
    echo "==> Claude Desktop 正在运行，跳过增强；退出后重新运行 ClawGod 安装器"
    exit 0
  fi
fi
[[ -f "$ASAR" ]] || die "未找到 $ASAR"
command -v python3 >/dev/null || die "需要 python3"
command -v codesign >/dev/null || die "需要 codesign（安装 Xcode Command Line Tools）"

VERSION=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$MAIN_PLIST" 2>/dev/null || echo unknown)
BACKUP="$USER_DATA_3P/app.asar.orig-$VERSION"
LANGUAGE_HELPER="$(dirname "${BASH_SOURCE[0]}")/desktop-language.mjs"
LANGUAGE_BACKUP="$USER_DATA_3P/desktop-language.orig-$VERSION"

quit_claude() {
  if [[ "$MODE" == "--install" ]]; then
    if pgrep -x Claude >/dev/null; then
      echo "==> Claude Desktop 已启动，跳过增强；退出后重新运行 ClawGod 安装器"
      exit 0
    fi
    return 0
  fi
  osascript -e 'tell application "Claude" to quit' >/dev/null 2>&1 || true
  for _ in $(seq 1 20); do pgrep -x Claude >/dev/null || break; sleep 0.5; done
}


# 读取 Info.plist 当前的 asar 头哈希（Electron 的完整性校验值）
get_plist_hash() {
  /usr/libexec/PlistBuddy -c 'Print :ElectronAsarIntegrity:Resources/app.asar:hash' "$MAIN_PLIST" 2>/dev/null || true
}

sign_claude() {
  python3 - "$APP" <<'SIGN_CLAUDE_EOF'
import os, pathlib, plistlib, subprocess, sys, tempfile

app = pathlib.Path(sys.argv[1])
magics = {b'\xcf\xfa\xed\xfe', b'\xfe\xed\xfa\xcf', b'\xce\xfa\xed\xfe', b'\xfe\xed\xfa\xce',
          b'\xca\xfe\xba\xbe', b'\xbe\xba\xfe\xca', b'\xca\xfe\xba\xbf', b'\xbf\xba\xfe\xca'}
try:
    binaries, bundles = [], []
    for root, dirs, files in os.walk(app / 'Contents'):
        dirs[:] = [name for name in dirs if not (pathlib.Path(root) / name).is_symlink()]
        bundles.extend(pathlib.Path(root) / name for name in dirs if name.endswith(('.app', '.framework')))
        for name in files:
            path = pathlib.Path(root) / name
            if path.is_symlink():
                continue
            with path.open('rb') as stream:
                if stream.read(4) in magics:
                    binaries.append(path)
    order = lambda path: (-len(path.parts), str(path))
    targets = sorted(binaries, key=order) + sorted(bundles, key=order) + [app]
    plans = []
    # 先读取全部元数据；ad-hoc 签名不能携带官方团队/钥匙串身份绑定。
    for path in targets:
        original = subprocess.run(['codesign', '-d', '--entitlements', ':-', '--xml', str(path)], capture_output=True, text=True)
        signed = original.returncode == 0
        if not signed and 'not signed at all' not in original.stderr:
            raise RuntimeError(original.stderr.strip() or '无法读取签名元数据: ' + str(path))
        entitlements = plistlib.loads(original.stdout.encode()) if original.stdout.strip() else {}
        if not isinstance(entitlements, dict):
            raise RuntimeError('签名权限格式无效: ' + str(path))
        for key in ['com.apple.application-identifier', 'application-identifier', 'com.apple.developer.team-identifier', 'keychain-access-groups']:
            entitlements.pop(key, None)
        entitlements['com.apple.security.cs.disable-library-validation'] = True
        plans.append((path, entitlements, signed))
    with tempfile.TemporaryDirectory(prefix='clawgod-desktop-sign-') as temporary:
        for index, (path, entitlements, signed) in enumerate(plans):
            plist = pathlib.Path(temporary) / (str(index) + '.plist')
            plist.write_bytes(plistlib.dumps(entitlements))
            command = ['codesign', '--force', '--sign', '-', '--timestamp=none']
            if signed:
                command.append('--preserve-metadata=flags,runtime')
            command += ['--entitlements', str(plist), str(path)]
            result = subprocess.run(command, capture_output=True, text=True)
            if result.returncode:
                raise RuntimeError(result.stderr.strip() or '签名失败: ' + str(path))
    subprocess.run(['codesign', '--verify', '--deep', '--strict', str(app)], check=True)
    print('==> 已逐组件安全重签名，JIT 等功能权限保留 (%d 个组件)' % len(plans))
except Exception as error:
    print('ERROR: Desktop 签名失败: ' + str(error), file=sys.stderr)
    sys.exit(1)
SIGN_CLAUDE_EOF
}

# ---------- --restore ----------
if [[ "${1:-}" == "--restore" ]]; then
  [[ -f "$BACKUP" ]] || die "未找到备份 $BACKUP"
  quit_claude
  if [[ -f "$LANGUAGE_BACKUP/manifest.json" ]]; then
    [[ -f "$LANGUAGE_HELPER" ]] || die "缺少中文资源回滚助手 $LANGUAGE_HELPER"
    "${CLAWGOD_BUN_BIN:-bun}" "$LANGUAGE_HELPER" restore "$APP" "$LANGUAGE_BACKUP" || die "中文资源回滚失败；保留备份以便重试"
  fi
  python3 - "$BACKUP" "$ASAR" "$APP/Contents" "$(get_plist_hash)" <<'PYEOF'
import sys, json, struct, hashlib, os
src, asar_path, contents, old = sys.argv[1], sys.argv[2], sys.argv[3], (sys.argv[4] or "")
raw = open(src, "rb").read()
jl = struct.unpack("<I", raw[12:16])[0]
restore_hash = hashlib.sha256(raw[16:16+jl]).hexdigest()
open(asar_path, "wb").write(raw); os.chmod(asar_path, 0o644)
n = 0
if old and old != restore_hash:
    for root, dirs, files in os.walk(contents):
        for fn in files:
            if fn == "Info.plist":
                p = os.path.join(root, fn)
                try: t = open(p, "rb").read()
                except OSError: continue
                if old.encode() in t:
                    open(p, "wb").write(t.replace(old.encode(), restore_hash.encode())); n += 1
print("plist hash restored in %d files (old=%s new=%s)" % (n, old[:16], restore_hash[:16]))
PYEOF
  sign_claude || die "codesign 失败；回滚备份保留以便重试"
  open "$APP"
  echo "✅ 已回滚到原始 asar 并重启 Claude"
  exit 0
fi

# ---------- 打补丁 ----------
command -v "${CLAWGOD_BUN_BIN:-bun}" >/dev/null || die "需要 Bun（用于写入前的 JavaScript 语法检查）"
echo "==> Claude Desktop $VERSION"
mkdir -p "$USER_DATA_3P"
if [[ ! -f "$BACKUP" ]]; then
  quit_claude
  cp "$ASAR" "$BACKUP"
  echo "==> 已创建备份: $BACKUP"
fi

echo "==> 准备修补 asar"
quit_claude

RESULT=$(python3 - "$BACKUP" "$ASAR" "$APP/Contents" "$(get_plist_hash)" <<'PYEOF'
import sys, json, struct, hashlib, re, os, subprocess

backup_path, asar_path, contents, old_hash_arg = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
raw = open(backup_path, "rb").read()          # 永远从原始备份构建（幂等）
hbl = struct.unpack("<I", raw[4:8])[0]
jl  = struct.unpack("<I", raw[12:16])[0]
hdr = json.loads(raw[16:16+jl].decode())
ds  = 8 + hbl

def walk(node, path=""):
    if "files" in node:
        for n, c in node["files"].items():
            yield from walk(c, path + "/" + n)
    elif "offset" in node:
        yield path, node

# 定位含 3p 静态特性表的 chunk（不写死文件名，跨版本可定位）
PAT_BROWSER  = re.compile(r"\{17519066:([A-Za-z_$][\w$]*),3990395613:\1\}")
PAT_SELECTOR = re.compile(r"function ([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\)\{return \2\.builtinBrowserEnabled\?([A-Za-z_$][\w$]*):([A-Za-z_$][\w$]*)\}")
PAT_BROWSER_RULES = re.compile(r'(17519066|3990395613):\{rule:"forcedFor",group:"builtinBrowser",value:!0\}')
PAT_NET_RULE = re.compile(r'4112513247:\{rule:"when",condition:"builtinBrowserEnabled",value:!0\}')
# 渲染层 bootstrap 的 growthbook 默认表（nEt）：内置浏览器 gate 4112513247 挂在
# 托管配置 builtinBrowserEnabled 下；"chicago"(CU) 的 hash key 745998442 缺失。
# （hash 算法 = 渲染层 R()：Java 32-bit hashCode 的十进制字符串）
PAT_NET = re.compile(r"\.\.\.[A-Za-z_$][\w$]*\.builtinBrowserEnabled&&\{4112513247:([A-Za-z_$][\w$]*)\(!0\)\}")
# buildConfig 暴露给渲染器的 builtinBrowserEnabled 字段也来自托管配置，恒真化
PAT_BUILD = re.compile(r"builtinBrowserEnabled:this\.builtinBrowserEnabled\(\)")
# current_user_access 里 dramatic_shrimp(Cowork 组织开关，含浏览器面板) 为
# void 0 时会被剔除 → 渲染层判“不可用”→ 浏览器按钮/设置组全部隐藏
PAT_ACCESS = re.compile(r'dramatic_shrimp:void 0')
# isCoworkBrowserAvailable：原逻辑依赖 PreviewPolicy 初始化时序（未初始化即
# fail-closed），窗口创建时的状态快照会固化为 unsupported → 恒真化
PAT_AJ = re.compile(r'function ([A-Za-z_$][\w$]*)\(\)\{return [A-Za-z_$][\w$]*\(\)\?[A-Za-z_$][\w$]*\("3990395613"\):!1\}')

tp = te = text = None
for p, e in walk(hdr):
    if not p.endswith((".js", ".cjs")):
        continue
    off, size = int(e["offset"]), e["size"]
    c = raw[ds+off : ds+off+size]
    if b"17519066" in c and b"builtinBrowserEnabled" in c:
        tp, te, text = p, e, c.decode("utf-8", "surrogateescape")
        break

if text is None:
    print("RESULT=TARGET_NOT_FOUND"); sys.exit(2)
# 已打补丁 = 静态表中存在 4293378213 映射条目（原代码只有带引号的调用点字面量）
if re.search(r"[,{]4293378213:[A-Za-z_$]", text):
    print("RESULT=ALREADY_PATCHED"); sys.exit(0)
legacy = bool(PAT_BROWSER.search(text))
patterns = [("browser", PAT_BROWSER, 1), ("selector", PAT_SELECTOR, 1), ("renderer", PAT_NET, 1)] if legacy else [
    ("browser rules", PAT_BROWSER_RULES, 2), ("renderer rule", PAT_NET_RULE, 1)]
patterns += [("Cowork access", PAT_ACCESS, 1), ("browser availability", PAT_AJ, 1)]
missing = ["%s: expected %d, found %d" % (name, count, len(pattern.findall(text)))
           for name, pattern, count in patterns if len(pattern.findall(text)) != count]
if not PAT_BUILD.search(text):
    missing.append("builtinBrowserEnabled config")
if missing:
    print("RESULT=PATTERN_MISMATCH (%s)" % "; ".join(missing)); sys.exit(2)

off0, size0 = int(te["offset"]), te["size"]
abs0 = ds + off0
# 保留上游未列出的 CU 子开关默认值。
cu_cfg = ('{"enabled":true,"batchOnly":false,"teachModeEnabled":true,'
          '"clipboardPasteMultiline":true,"coordinateMode":"pixels",'
          '"dispatchCuGrantTtlMs":1800000,"hideBeforeAction":true,'
          '"mouseAnimation":true,"pixelValidation":false,"screenshotFilter":true}')
def sub_browser(mm):
    g = mm.group(1)
    # CU 配置 gate 1291166712（chicago_config）：enabled=true 是设置入口与
    # 会话内 CU 的总开关；batchOnly=false 保持交互式控制而非仅批量截图
    cu_entry = ('1291166712:{value:%s,on:true,off:false,source:"force",'
                'experiment:null,experimentResult:null}' % cu_cfg)
    return "{17519066:%s,3990395613:%s,4293378213:%s,36693946:%s,%s}" % (g, g, g, g, cu_entry)
if legacy:
    text = PAT_BROWSER.sub(sub_browser, text, count=1)
    text = PAT_SELECTOR.sub(lambda m: "function %s(%s){return %s}" % (m.group(1), m.group(2), m.group(3)), text, count=1)
    g3 = PAT_NET.search(text).group(1)
    text = PAT_NET.sub(
        "...!0&&{4112513247:%s(!0),745998442:%s(!0),709117870:%s(!1)}" % (g3, g3, g3),
        text, count=1)
else:
    def sub_browser_rule(m):
        entry = '%s:{rule:"forced",value:!0}' % m.group(1)
        if m.group(1) == "3990395613":
            entry += (',4293378213:{rule:"forced",value:!0},36693946:{rule:"forced",value:!0},'
                      '1291166712:{rule:"forced",value:%s}' % cu_cfg)
        return entry
    text = PAT_BROWSER_RULES.sub(sub_browser_rule, text)
    text = PAT_NET_RULE.sub(
        '4112513247:{rule:"always",value:!0},745998442:{rule:"always",value:!0},709117870:{rule:"always",value:!1}',
        text, count=1)
# 补丁 4：rendererConfig 的 builtinBrowserEnabled 字段恒真
text = PAT_BUILD.sub("builtinBrowserEnabled:!0", text)
# 补丁 5：Cowork 组织开关（浏览器面板）在 current_user_access 中置为 available
text = PAT_ACCESS.sub('dramatic_shrimp:"available"', text, count=1)
# 补丁 6：isCoworkBrowserAvailable 恒真（绕过 PreviewPolicy 初始化时序的 fail-closed）
text = PAT_AJ.sub(lambda m: "function %s(){return!0}" % m.group(1), text, count=1)
new_content = text.encode("utf-8", "surrogateescape")
delta = len(new_content) - size0

def rehash(e, c):
    e["size"] = len(c)
    bs = e["integrity"].get("blockSize", 4194304)
    blocks = [c[i:i+bs] for i in range(0, len(c), bs)] or [b""]
    e["integrity"]["hash"] = hashlib.sha256(c).hexdigest()
    e["integrity"]["blocks"] = [hashlib.sha256(b).hexdigest() for b in blocks]

rehash(te, new_content)
for p, e in walk(hdr):
    if e is not te and int(e["offset"]) >= off0:
        e["offset"] = str(int(e["offset"]) + delta)

new_json = json.dumps(hdr, ensure_ascii=False, separators=(",", ":")).encode()
pad = (4 - len(new_json) % 4) % 4
payload = struct.pack("<I", len(new_json)) + new_json + b"\x00" * pad
header_buf = struct.pack("<I", len(payload)) + payload
prefix = struct.pack("<I", 4) + struct.pack("<I", len(header_buf)) + header_buf

# 拼接：原字节保留，仅替换目标 chunk 段
out = prefix + raw[ds:abs0] + new_content + raw[abs0+size0:]

# 全文件哈希自检（任何偏移/顺序错误在此拦截）
new_ds = 8 + len(header_buf)
bad = 0
for p, e in walk(hdr):
    o, s = int(e["offset"]), e["size"]
    if hashlib.sha256(out[new_ds+o : new_ds+o+s]).hexdigest() != e["integrity"]["hash"]:
        bad += 1
if bad:
    print("RESULT=VERIFY_FAILED (%d files)" % bad); sys.exit(3)

# 写入前完成语法与 plist 检查，失败时保留当前可启动的应用。
syntax = subprocess.run([os.environ.get("CLAWGOD_BUN_BIN", "bun"), "-e", 'new Bun.Transpiler({loader:"js"}).transformSync(await Bun.stdin.text());'],
                        input=new_content, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
if syntax.returncode:
    sys.stderr.write(syntax.stderr.decode("utf-8", "replace"))
    print("RESULT=SYNTAX_CHECK_FAILED"); sys.exit(3)
new_hash = hashlib.sha256(new_json).hexdigest()
old_hash = old_hash_arg.strip()
if not re.fullmatch(r"[0-9a-fA-F]{64}", old_hash):
    print("RESULT=PLIST_HASH_NOT_FOUND"); sys.exit(4)
plists = {}
for root, dirs, files in os.walk(contents):
    for fn in files:
        if fn == "Info.plist":
            p = os.path.join(root, fn)
            try: t = open(p, "rb").read()
            except OSError: continue
            if old_hash.encode() in t:
                plists[p] = t.replace(old_hash.encode(), new_hash.encode())
if os.path.join(contents, "Info.plist") not in plists:
    print("RESULT=PLIST_HASH_NOT_FOUND (Info.plist does not contain the current hash)"); sys.exit(4)
open(asar_path, "wb").write(out)
os.chmod(asar_path, 0o644)
for p, data in plists.items():
    open(p, "wb").write(data)
print("RESULT=PATCH_OK")
print("INFO_PLISTS=%d" % len(plists))
print("OLD_HASH=" + old_hash)
print("NEW_HASH=" + new_hash)
print("DELTA=%d" % delta)
PYEOF
) || { printf '%s\n' "$RESULT" >&2; die "asar 补丁失败"; }

STATUS=$(echo "$RESULT" | grep -o "RESULT=[A-Z_]*" | head -1 | cut -d= -f2)
case "$STATUS" in
  PATCH_OK)
    echo "$RESULT" | grep -v "^RESULT=" || true
    ;;
  ALREADY_PATCHED)
    echo "==> 已打过补丁，无需修改"
    ;;
  *) die "补丁未生效: $STATUS（应用版本可能变化，需重新分析）" ;;
esac

if [[ -f "$LANGUAGE_HELPER" ]]; then
  if ! "${CLAWGOD_BUN_BIN:-bun}" "$LANGUAGE_HELPER" install "$APP" "$LANGUAGE_BACKUP"; then
    echo "⚠️ 简体中文选项增强未完成；CU/浏览器补丁继续生效，语言备份保留以便重试"
  fi
else
  echo "==> 未找到中文资源助手，跳过语言选项增强"
fi

echo "==> 保留 JIT 等功能权限并逐组件 ad-hoc 重签名"
sign_claude || die "codesign 失败"

if [[ "$MODE" == "--install" ]]; then
  echo "✅ Claude Desktop CU/浏览器补丁已写入，下次启动应用时生效；实际工具仍需在会话中验证"
  echo "   回滚: bash \"$0\" --restore \"$APP\""
  exit 0
fi

echo "==> 重启 Claude"
open "$APP"
sleep 12
if pgrep -x Claude >/dev/null; then
  FEAT=$(grep "loaded .* features" "$HOME/Library/Logs/Claude-3p/main.log" 2>/dev/null | tail -1 | sed -E 's/.*loaded ([0-9]+) features.*/\1/' || true)
  echo "✅ 补丁完成，Claude 已重启（growthbook 特性数: ${FEAT:-未知}，仅供诊断）"
  echo "   请在界面确认 CU/浏览器入口及实际会话工具是否可用"
  echo "   回滚: bash $0 --restore；应用更新后重新运行本脚本即可"
else
  echo "⚠️ Claude 未启动，崩溃报告见 ~/Library/Logs/DiagnosticReports/"
  echo "   可回滚: bash $0 --restore"
fi
