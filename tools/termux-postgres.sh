# Loaded by the source launcher on native Termux.

start_termux_postgres() {
  local directory="$STATE_DIR/postgres" cluster socket
  cluster="$directory/cluster"
  socket="$directory/socket"
  command -v pg_ctl >/dev/null 2>&1 || die 'Install Termux PostgreSQL with: pkg install postgresql'
  [ ! -L "$directory" ] && [ ! -L "$cluster" ] && [ ! -L "$socket" ] ||
    die "PostgreSQL data and socket directories must not be symlinks: $directory"
  (umask 077; mkdir -p -- "$socket")
  chmod 700 -- "$directory" "$socket"
  if [ ! -e "$cluster" ]; then
    (
      umask 077
      staged=$(mktemp -d "$directory/init.XXXXXXXX")
      trap 'rm -rf -- "$staged"' EXIT
      initdb -D "$staged" -U mew --encoding=UTF8 --locale=C --auth-local=trust --auth-host=scram-sha-256
      mv -nT -- "$staged" "$cluster"
    )
  fi
  [ -f "$cluster/PG_VERSION" ] || die "PostgreSQL data is incomplete: $cluster"
  if ! pg_ctl -D "$cluster" status >/dev/null 2>&1; then
    pg_ctl -D "$cluster" -l "$directory/postgres.log" -w \
      -o "-h '' -k $(printf '%q' "$socket")" start
  fi
  DATABASE_URL=$(node -e '
    const url = new URL("postgresql://mew@localhost/postgres");
    url.searchParams.set("host", process.argv[1]);
    process.stdout.write(url.href);
  ' "$socket")
  export DATABASE_URL
}

stop_termux_postgres() {
  local cluster="$STATE_DIR/postgres/cluster"
  if command -v pg_ctl >/dev/null 2>&1 && pg_ctl -D "$cluster" status >/dev/null 2>&1; then
    pg_ctl -D "$cluster" -m fast -w stop
  fi
}
