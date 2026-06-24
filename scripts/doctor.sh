#!/usr/bin/env bash
# make doctor — detecta estáticamente los gotchas conocidos de Sincpro Mobile
# (los que tsc NO atrapa). Ver docs/GOTCHAS.md. Salida != 0 si encuentra alguno.
# Es idéntico en todos los repos; escanea el código fuente del repo actual.
set -uo pipefail

# Carpeta de fuente: el subfolder con el nombre del repo (sincpro_mobile*), si existe.
SRC_DIRS=$(find . -maxdepth 1 -type d -name 'sincpro_mobile*' 2>/dev/null)
[ -z "$SRC_DIRS" ] && SRC_DIRS="."

EXCLUDES='--include=*.ts --include=*.tsx'
PRUNE='node_modules|/dist/|/android/|/ios/|/.expo/|/lib/'

found=0
note() { echo "  ✗ $1"; found=1; }
section() { echo ""; echo "── $1 ──"; }

# El design system (@sincpro/mobile-ui) DEFINE los layouts presentacionales y Display.Logo:
# los checks 2 y 4 apuntan a código CONSUMIDOR, no al paquete que los provee.
IS_UI_PKG=0
[ -d ./sincpro_mobile_ui ] && IS_UI_PKG=1

scan() { # scan <regex> ; imprime matches (archivo:linea) filtrando dirs generados
  grep -rnE $EXCLUDES "$1" $SRC_DIRS 2>/dev/null | grep -vE "$PRUNE"
}

echo "🩺 make doctor — chequeo de gotchas (ver docs/GOTCHAS.md)"

section "1. const enum (rompe runtime con Babel/Metro — usar enum regular)"
hits=$(scan '\bconst enum\b')
if [ -n "$hits" ]; then echo "$hits" | while IFS= read -r l; do note "$l"; done; found=1; else echo "  ✓ ninguno"; fi

section "2. layout presentacional importado como route element (debe venir de @sincpro/mobile)"
# Excepción legítima: router_layouts.tsx del core los envuelve con <Outlet/>; mobile-ui los define.
if [ "$IS_UI_PKG" = "1" ]; then
  echo "  · omitido (este repo es el design system que define los layouts)"
else
  hits=$(scan 'from "@sincpro/mobile-ui/layouts/(PlainLayout|TabNavigatorLayout)"' | grep -v 'router_layouts')
  if [ -n "$hits" ]; then echo "$hits" | while IFS= read -r l; do note "$l"; done; found=1; else echo "  ✓ ninguno"; fi
fi

section "3. repos.get/resolve en field-init (eager → 'Repository not found'; usar getter lazy)"
hits=$(scan '(private|protected|public)[[:space:]]+(readonly[[:space:]]+)?[A-Za-z0-9_]+[[:space:]]*=[[:space:]]*repos\.(get|resolve)\(')
if [ -n "$hits" ]; then echo "$hits" | while IFS= read -r l; do note "$l"; done; found=1; else echo "  ✓ ninguno"; fi

section "4. logo/header con variante de logo sin source (logo vacío)"
# Display.Logo y FormViewV2.Header con variante de logo, sin source/logoSource en el mismo tag (multilínea)
if [ "$IS_UI_PKG" = "1" ]; then
  echo "  · omitido (este repo define Display.Logo/FormViewV2.Header)"
  logo_hits=""
else
logo_hits=$(for d in $SRC_DIRS; do
  find "$d" \( -name '*.tsx' \) 2>/dev/null | grep -vE "$PRUNE" | while IFS= read -r f; do
    perl -0777 -ne '
      while (/<Display\.Logo\b(?:(?!\/>).)*?\/>/gs) {
        my $tag=$&; print "$ARGV: <Display.Logo> sin source\n" if $tag !~ /\bsource\b/;
      }
      while (/<FormViewV2\.Header\b(?:(?!\/>|>).)*?(?:\/>|>)/gs) {
        my $tag=$&;
        print "$ARGV: <FormViewV2.Header> variante de logo sin logoSource\n"
          if $tag =~ /ONLY_LOGO|LOGO_WITH_BACK_BUTTON/ && $tag !~ /logoSource/;
      }
    ' "$f"
  done
done)
fi
if [ -n "$logo_hits" ]; then echo "$logo_hits" | while IFS= read -r l; do note "$l"; done; found=1; else echo "  ✓ ninguno"; fi

echo ""
if [ "$found" -ne 0 ]; then
  echo "✘ doctor encontró gotchas. Fix en docs/GOTCHAS.md."
  exit 1
fi
echo "✓ doctor OK — sin gotchas conocidos"
