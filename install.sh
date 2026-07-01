#!/usr/bin/env bash
set -euo pipefail

UUID="keychron-k5-pro@local"
SRC_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEST_DIR="${HOME}/.local/share/gnome-shell/extensions/${UUID}"

required_files=(
  "extension.js"
  "metadata.json"
  "stylesheet.css"
  "tools/keychron-via-light.py"
)

usage() {
  cat <<EOF
Usage:
  ./install.sh [--symlink] [--no-enable]

Options:
  --symlink     Install as a symlink to this checkout for development.
  --no-enable   Copy files but do not run gnome-extensions enable.
EOF
}

install_mode="copy"
enable_extension=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --symlink)
      install_mode="symlink"
      ;;
    --no-enable)
      enable_extension=0
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
  shift
done

for file in "${required_files[@]}"; do
  if [[ ! -f "${SRC_DIR}/${file}" ]]; then
    echo "Missing required file: ${file}" >&2
    exit 1
  fi
done

if ! command -v gnome-extensions >/dev/null 2>&1; then
  echo "gnome-extensions was not found. Install GNOME Shell tools first." >&2
  exit 1
fi

if ! command -v gsettings >/dev/null 2>&1; then
  echo "gsettings was not found. Install GNOME/GSettings tools first." >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 was not found. It is required for the VIA lighting helper." >&2
  exit 1
fi

mkdir -p "$(dirname -- "${DEST_DIR}")"

if [[ -e "${DEST_DIR}" || -L "${DEST_DIR}" ]]; then
  if [[ -L "${DEST_DIR}" && "$(readlink -- "${DEST_DIR}")" == "${SRC_DIR}" ]]; then
    :
  elif [[ "${install_mode}" == "copy" && -d "${DEST_DIR}" && ! -L "${DEST_DIR}" ]]; then
    rm -rf -- "${DEST_DIR}/tools"
  else
    backup="${DEST_DIR}.backup.$(date +%Y%m%d-%H%M%S)"
    mv -- "${DEST_DIR}" "${backup}"
    echo "Backed up existing extension to:"
    echo "  ${backup}"
  fi
fi

if [[ "${install_mode}" == "symlink" ]]; then
  ln -sfn -- "${SRC_DIR}" "${DEST_DIR}"
else
  mkdir -p "${DEST_DIR}/tools"
  cp -- "${SRC_DIR}/extension.js" "${DEST_DIR}/"
  cp -- "${SRC_DIR}/metadata.json" "${DEST_DIR}/"
  cp -- "${SRC_DIR}/stylesheet.css" "${DEST_DIR}/"
  cp -- "${SRC_DIR}/tools/keychron-via-light.py" "${DEST_DIR}/tools/"
  chmod +x "${DEST_DIR}/tools/keychron-via-light.py"
fi

# GNOME Shell normally owns these keys. This extension handles them instead for
# the software dimmer path.
gsettings set org.gnome.shell.keybindings screen-brightness-down "[]"
gsettings set org.gnome.shell.keybindings screen-brightness-up "[]"

if [[ "${enable_extension}" -eq 1 ]]; then
  if gnome-extensions info "${UUID}" >/dev/null 2>&1; then
    gnome-extensions enable "${UUID}" || true
  else
    echo "GNOME has not discovered ${UUID} yet."
    echo "Log out and back in, then run:"
    echo "  gnome-extensions enable ${UUID}"
  fi
fi

cat <<EOF

Installed ${UUID}
Location:
  ${DEST_DIR}

Recommended after a fresh OS rebuild:
  1. Log out and back in, or reboot, so GNOME Shell loads the extension code.
  2. Run: gnome-extensions enable ${UUID}
  3. Test fn+F1/F2 brightness and Backlight Off / On.

EOF
