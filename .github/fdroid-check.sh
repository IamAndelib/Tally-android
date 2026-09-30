#!/usr/bin/env bash
# Builds this commit the way F-Droid does and checks it is byte-identical to our signed APK (see the "fdroid" job in
# .github/workflows/build-apk.yml). Runs inside registry.gitlab.com/fdroid/fdroidserver:buildserver-trixie, following
# fdroiddata's own "fdroid build" CI job: fdroidserver from git, JDK 21, `fdroid build --on-server` as user vagrant.
set -euo pipefail
repo="$PWD"

export ANDROID_HOME=/opt/android-sdk
test -n "${fdroidserver:-}" || source /etc/profile.d/bsenv.sh
apt-get update -q
apt-get install -qy sudo openjdk-21-jdk-headless > /dev/null
update-alternatives --set java /usr/lib/jvm/java-21-openjdk-amd64/bin/java
sdkmanager "platform-tools" "build-tools;31.0.0" > /dev/null

rm -rf "$fdroidserver"
git clone -q --depth 1 https://gitlab.com/fdroid/fdroidserver.git "$fdroidserver"
git -C "$home_vagrant/gradlew-fdroid" pull -q || true
export PATH="$fdroidserver:$PATH" PYTHONPATH="$fdroidserver:$fdroidserver/examples" PYTHONUNBUFFERED=true
fdroid="sudo --preserve-env --user vagrant env PATH=$fdroidserver:$PATH PYTHONPATH=$fdroidserver:$fdroidserver/examples
  PYTHONUNBUFFERED=true HOME=$home_vagrant fdroid"

version=$(sed -n 's/^tallyVersion=//p' gradle.properties)
code=$(sed -n 's/^tallyVersionCode=//p' gradle.properties)
recipe="$repo/docs/fdroid/app.tally.expenses.yml"

# 1. the recipe we will submit: fdroid lint, and rewritemeta must leave it as it is
# inside a real fdroiddata checkout (only its config: categories, icons, …), which is what lint checks against
lint=$(mktemp -d)/fdroiddata
git clone -q --depth 1 --filter=blob:none --sparse https://gitlab.com/fdroid/fdroiddata.git "$lint"
git -C "$lint" sparse-checkout set --no-cone /config.yml /config/
mkdir -p "$lint/metadata"
grep -v '^#' "$recipe" > "$lint/metadata/app.tally.expenses.yml" # the file as submitted: without our header comment
cp "$lint/metadata/app.tally.expenses.yml" "$lint/submitted.yml"
(cd "$lint" && fdroid readmeta && fdroid lint app.tally.expenses)
(cd "$lint" && fdroid rewritemeta app.tally.expenses)
if ! diff -u "$lint/submitted.yml" "$lint/metadata/app.tally.expenses.yml"; then
  echo "::warning::fdroid rewritemeta would reformat the recipe (diff above)"
fi

# 2. the reference APK: the published release when this commit is its tag, else the build job's throwaway-signed APK
ref=/tmp/ref
mkdir -p "$ref"
git config --global --add safe.directory "$repo"
tagged=$(git rev-list -n 1 "v$version" 2> /dev/null || true)
if [ "$tagged" = "$(git rev-parse HEAD)" ]; then
  binaries="https://github.com/$GH_REPO/releases/download/v%v/Tally-v%v.apk"
  echo "Comparing with the published release v$version"
else
  # fdroid only downloads Binaries over https, so the local reference is compared after the build below, with
  # the same fdroidserver function (common.verify_apks) that `fdroid build` uses for Binaries
  cp /tmp/check/app-release.apk "$ref/Tally-v$version.apk"
  binaries=""
  echo "Comparing with this commit's throwaway-signed release build"
fi
signer=$("$ANDROID_HOME/build-tools/31.0.0/apksigner" verify --print-certs "${ref}/Tally-v$version.apk" 2> /dev/null \
  | sed -n 's/.*SHA-256 digest: //p' | head -1 || true)
if [ -z "$signer" ]; then # published release: read its signer from the recipe
  signer=$(sed -n 's/^AllowedAPKSigningKeys: //p' "$recipe")
fi

# 3. a recipe for exactly this commit and version, with that reference
build="$home_vagrant/work"
rm -rf "$build"
mkdir -p "$build/metadata" "$build/config" "$build/tmp" "$build/unsigned" "$build/logs" "$home_vagrant/.android" \
  "$home_vagrant/.gradle"
cp -R "$lint/config/." "$build/config/"
python3 - "$recipe" "$build/metadata/app.tally.expenses.yml" "$(git rev-parse HEAD)" "$version" "$code" \
  "$binaries" "$signer" << 'EOF'
import re, sys
src, dst, commit, name, code, binaries, signer = sys.argv[1:]
t = open(src).read()
t = re.sub(r"(?m)^(\s*- versionName: ).*$", r"\g<1>" + name, t)
t = re.sub(r"(?m)^(\s*versionCode: ).*$", r"\g<1>" + code, t)
t = re.sub(r"(?m)^(\s*commit: ).*$", r"\g<1>" + commit, t)
t = re.sub(r"(?m)^CurrentVersion: .*$", "CurrentVersion: " + name, t)
t = re.sub(r"(?m)^CurrentVersionCode: .*$", "CurrentVersionCode: " + code, t)
if binaries:
    t = re.sub(r"(?m)^Binaries: .*$", "Binaries: " + binaries, t)
    t = re.sub(r"(?m)^AllowedAPKSigningKeys: .*$", "AllowedAPKSigningKeys: " + signer, t)
else:
    t = re.sub(r"(?m)^(Binaries|AllowedAPKSigningKeys): .*\n", "", t)
open(dst, "w").write(t)
EOF
cat "$build/metadata/app.tally.expenses.yml"
chown -R vagrant "$build" "$home_vagrant/.android" "$home_vagrant/.gradle"

# 4. F-Droid's build: fails if its APK differs from the reference in anything but the signature
cd "$build"
$fdroid fetchsrclibs "app.tally.expenses:$code" --verbose # on the server, the source is fetched first
(unset CI; $fdroid build --verbose --test --on-server --no-tarball "app.tally.expenses:$code")
ls -l tmp/
built="$build/tmp/app.tally.expenses_$code.apk"
if [ -n "$binaries" ]; then
  test -e "tmp/binaries/app.tally.expenses_$code.binary.apk" \
    || { echo "::error::F-Droid's build was not verified against the reference APK"; exit 1; }
else
  chmod -R a+rX "$ref"
  # (as root: `fdroid build --on-server` uninstalls sudo when it's done)
  if ! PYTHONPATH="$fdroidserver" python3 - "$ref/Tally-v$version.apk" "$built" << 'PY'
import sys, tempfile
from fdroidserver import common
common.config = common.read_config()
with tempfile.TemporaryDirectory() as tmp:
    problem = common.verify_apks(sys.argv[1], sys.argv[2], tmp)
print(problem or "F-Droid's build matches the signed APK")
sys.exit(1 if problem else 0)
PY
  then
    echo "::error::F-Droid's build differs from our signed release build. Entries that differ:"
    python3 - "$ref/Tally-v$version.apk" "$built" << 'PY'
import sys, zipfile
a, b = (zipfile.ZipFile(p) for p in sys.argv[1:])
ia = {i.filename: i for i in a.infolist()}
ib = {i.filename: i for i in b.infolist()}
for name in sorted(set(ia) | set(ib)):
    x, y = ia.get(name), ib.get(name)
    if not x or not y or (x.CRC, x.file_size, x.compress_type) != (y.CRC, y.file_size, y.compress_type):
        print(" ", name, "signed:", x and (x.CRC, x.file_size, x.compress_type),
              "fdroid:", y and (y.CRC, y.file_size, y.compress_type))
names = lambda z: [i.filename for i in z.infolist() if not i.filename.startswith("META-INF/")]
print("same entry order:", names(a) == names(b))
PY
    exit 1
  fi
fi
echo "Reproducible: F-Droid's build of $(git -C "$repo" rev-parse --short HEAD) matches the signed APK"
