#!/bin/bash
# ============================================================
# misc-preview.sh
# Toggles the misc_dev_show_price flag in snippets/misc-card-product.liquid.
# When ON: prices + add-to-cart show for any visitor (including logged-out).
# When OFF: production behaviour, only logged-in customers see prices.
#
# Run from the theme root:
#   ./scripts/misc-preview.sh
#
# Requires the dev server (shopify theme dev) to be running for the
# change to hot-reload in the browser. Otherwise the change is just
# in the local file and will take effect on next push.
#
# IMPORTANT: turn this OFF before merging to main / pushing to production.
# ============================================================

FILE="snippets/misc-card-product.liquid"

if [ ! -f "$FILE" ]; then
  echo "Error: $FILE not found. Run this script from the theme root."
  exit 1
fi

if grep -q "misc_dev_show_price = false" "$FILE"; then
  sed -i '' 's/misc_dev_show_price = false/misc_dev_show_price = true/' "$FILE"
  echo "Preview ON  — prices visible without login (DEV ONLY)"
  echo ""
  echo "Reminder: run this script again to turn it back off before pushing to main."
elif grep -q "misc_dev_show_price = true" "$FILE"; then
  sed -i '' 's/misc_dev_show_price = true/misc_dev_show_price = false/' "$FILE"
  echo "Preview OFF — production behaviour, login required to see prices"
else
  echo "Warning: could not find the misc_dev_show_price line in $FILE."
  echo "Was the dev flag removed? Check the snippet manually."
  exit 1
fi
