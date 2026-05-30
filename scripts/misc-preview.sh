#!/bin/bash
# ============================================================
# misc-preview.sh
# Toggles the `misc_dev_show_price` theme setting in
# config/settings_data.json.
#
# When ON  : prices + RRP + stepper render for any visitor,
#            including logged-out ones. Locally useful for
#            previewing the price layout without registering
#            test customers.
# When OFF : production behaviour — only logged-in customers
#            see prices; everyone else sees the
#            "Log in to see pricing" CTA.
#
# Default is OFF. The setting is defined in
# config/settings_schema.json under "MISC: development".
#
# Run from the theme root:
#   ./scripts/misc-preview.sh
#
# Requires the dev server (shopify theme dev) to be running for
# the change to hot-reload in the browser. Otherwise the change
# is just in the local file and will take effect on the next push.
#
# IMPORTANT: turn this OFF before merging to main / pushing to
# production. The script will refuse to flip the setting on if
# the working tree is on main.
# ============================================================

FILE="config/settings_data.json"

if [ ! -f "$FILE" ]; then
  echo "Error: $FILE not found. Run this script from the theme root."
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "Error: python3 is required to safely edit JSON."
  exit 1
fi

CURRENT=$(python3 -c "import json; print(json.load(open('$FILE')).get('current', {}).get('misc_dev_show_price', False))")

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)

if [ "$CURRENT" = "False" ] || [ "$CURRENT" = "false" ]; then
  if [ "$BRANCH" = "main" ]; then
    echo "Refusing to enable dev preview on the main branch."
    echo "Switch to develop or a feature branch first."
    exit 1
  fi
  python3 -c "
import json
with open('$FILE') as f: d = json.load(f)
d['current']['misc_dev_show_price'] = True
with open('$FILE', 'w') as f: json.dump(d, f, indent=2, ensure_ascii=False)
"
  echo "Preview ON  — prices visible without login (DEV ONLY)"
  echo ""
  echo "Reminder: run this script again to turn it back off before pushing to main."
else
  python3 -c "
import json
with open('$FILE') as f: d = json.load(f)
d['current']['misc_dev_show_price'] = False
with open('$FILE', 'w') as f: json.dump(d, f, indent=2, ensure_ascii=False)
"
  echo "Preview OFF — production behaviour, login required to see prices"
fi
