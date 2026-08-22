#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later

set -euo pipefail

UUID="k5-pro-controls@royza.github.io"
SRC_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEST_DIR="${HOME}/.local/share/gnome-shell/extensions/${UUID}"
BACKUP_ROOT="${XDG_DATA_HOME:-${HOME}/.local/share}/gnome-shell/extension-backups/${UUID}"

required_files=(
  "extension.js"
  "controller.js"
  "hid.js"
  "prefs.js"
  "profile.js"
  "metadata.json"
  "stylesheet.css"
  "schemas/org.gnome.shell.extensions.k5-pro-controls.gschema.xml"
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

if ! command -v glib-compile-schemas >/dev/null 2>&1; then
  echo "glib-compile-schemas was not found. Install GLib development utilities first." >&2
  exit 1
fi

mkdir -p "$(dirname -- "${DEST_DIR}")"

if [[ -e "${DEST_DIR}" || -L "${DEST_DIR}" ]]; then
  if [[ "${install_mode}" == "symlink" && -L "${DEST_DIR}" && "$(readlink -- "${DEST_DIR}")" == "${SRC_DIR}" ]]; then
    :
  else
    mkdir -p "${BACKUP_ROOT}"
    backup="${BACKUP_ROOT}/$(date +%Y%m%d-%H%M%S)"
    mv -- "${DEST_DIR}" "${backup}"
    echo "Backed up existing extension to:"
    echo "  ${backup}"
  fi
fi

if [[ "${install_mode}" == "symlink" ]]; then
  ln -sfn -- "${SRC_DIR}" "${DEST_DIR}"
  glib-compile-schemas "${DEST_DIR}/schemas"
else
  mkdir -p "${DEST_DIR}"
  cp -- "${SRC_DIR}/extension.js" "${DEST_DIR}/"
  cp -- "${SRC_DIR}/controller.js" "${DEST_DIR}/"
  cp -- "${SRC_DIR}/hid.js" "${DEST_DIR}/"
  cp -- "${SRC_DIR}/prefs.js" "${DEST_DIR}/"
  cp -- "${SRC_DIR}/profile.js" "${DEST_DIR}/"
  cp -- "${SRC_DIR}/metadata.json" "${DEST_DIR}/"
  cp -- "${SRC_DIR}/stylesheet.css" "${DEST_DIR}/"
  mkdir -p "${DEST_DIR}/schemas"
  cp -- "${SRC_DIR}/schemas/org.gnome.shell.extensions.k5-pro-controls.gschema.xml" "${DEST_DIR}/schemas/"
  glib-compile-schemas "${DEST_DIR}/schemas"
fi

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

If GNOME Shell has already cached this UUID's code, log out and back in before
testing the updated files.

EOF
