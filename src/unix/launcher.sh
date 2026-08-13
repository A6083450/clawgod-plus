LAUNCHER_CONTENT="#!/bin/bash
# clawgod launcher
# CLAWGOD_LAUNCHER_V1
CLAWGOD_CLI=\"$CLAWGOD_DIR/cli.cjs\"
CLAWGOD_IMPORT=\"$CLAWGOD_DIR/clawgod-import\"
BUN_BIN=\"$BUN_BIN\"
# Route 'import' subcommand to clawgod-import binary
if [ \"\$1\" = \"import\" ]; then
  shift
  if [ -x \"\$CLAWGOD_IMPORT\" ]; then
    exec \"\$CLAWGOD_IMPORT\" \"\$@\"
  else
    echo \"clawgod: import tool not installed. Reinstall clawgod to get it.\" >&2
    exit 127
  fi
fi
if [ ! -f \"\$CLAWGOD_CLI\" ]; then
  echo \"clawgod: installation at $CLAWGOD_DIR is missing (cli.cjs not found)\" >&2
  echo \"clawgod: reinstall via  curl -fsSL https://github.com/A6083450/clawgod-plus/releases/latest/download/install.sh | bash\" >&2
  echo \"clawgod: or remove this launcher:  rm \\\"\$0\\\"\" >&2
  exit 127
fi
if [ ! -x \"\$BUN_BIN\" ]; then
  if command -v bun >/dev/null 2>&1; then BUN_BIN=\"\$(command -v bun)\"; fi
fi
if [ ! -x \"\$BUN_BIN\" ]; then
  echo \"clawgod: bun runtime not found at \$BUN_BIN\" >&2
  echo \"clawgod: install bun  curl -fsSL https://bun.sh/install | bash\" >&2
  exit 127
fi
export CLAUDE_CODE_EXECPATH=\"$CLAUDE_BIN.orig\"
if [ \"\${1:-}\" = \"agents\" ] && [ \"\${CLAWGOD_NO_AUTO_CHROME:-}\" != \"1\" ]; then
  exec \"\$BUN_BIN\" \"\$CLAWGOD_CLI\" --chrome \"\$@\"
fi
CLAWGOD_AUTO_CHROME=1
if [ \"\${CLAWGOD_NO_AUTO_CHROME:-}\" = \"1\" ]; then
  CLAWGOD_AUTO_CHROME=0
fi
for arg in \"\$@\"; do
  case \"\$arg\" in
    --chrome)
      CLAWGOD_AUTO_CHROME=0
      break
      ;;
    -p|--print|--permission-mode|--input-format|--output-format)
      CLAWGOD_AUTO_CHROME=0
      ;;
  esac
done
case \"\${1:-}\" in
  -h|--help|-v|--version|version|update|upgrade|auth|login|logout|config|mcp|daemon|logs|attach|stop|kill|respawn|rm|doctor|install|uninstall|completion|migrate-installer|setup-token)
    CLAWGOD_AUTO_CHROME=0
    ;;
esac
if [ \"\$CLAWGOD_AUTO_CHROME\" = \"1\" ]; then
  exec \"\$BUN_BIN\" \"\$CLAWGOD_CLI\" --chrome \"\$@\"
fi
exec \"\$BUN_BIN\" \"\$CLAWGOD_CLI\" \"\$@\""
