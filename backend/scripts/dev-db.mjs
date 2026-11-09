// 개발/검증 전용 임시 PostgreSQL 관리 스크립트 (운영 DB와 무관).
// 사용: node scripts/dev-db.mjs <setup | start | stop | reset | url>
//  setup : (프로젝트 경로에 한글이 있을 때만 필요) PostgreSQL 패키지를 한글 없는 폴더에 설치
//  start : DB 기동 (최초 1회는 data 폴더 생성 + knot_dev 생성). Ctrl+C 로 종료
//  stop  : 실행 중인 DB 종료
//  reset : 종료된 상태에서 data 폴더를 삭제 = 가짜 데이터 포함 모든 내용 제거
//  url   : DATABASE_URL 값 출력
//
// 배경: Windows 에서 PostgreSQL 바이너리와 data 폴더 경로에 한글 등 비ASCII 문자가 있으면
//       초기화가 "invalid byte sequence for encoding UTF8" 로 실패한다.
//       그래서 프로젝트 경로가 비ASCII 이면 Public 폴더(ASCII)의 별도 위치를 사용한다.
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PG_PACKAGE = 'embedded-postgres@17.11.0-beta.19';
const isAscii = (s) => !/[^\x00-\x7F]/.test(s);

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = process.env.PUBLIC || 'C:\\Users\\Public';
const useProjectPaths = isAscii(root);

// 패키지(바이너리) 위치와 data 위치. 환경 변수로 재지정 가능
const toolsDir = process.env.KNOT_DEV_DB_TOOLS
  ? resolve(process.env.KNOT_DEV_DB_TOOLS)
  : useProjectPaths ? root : join(publicDir, 'knot-dev-tools');
const dataDir = process.env.KNOT_DEV_DB_DIR
  ? resolve(process.env.KNOT_DEV_DB_DIR)
  : useProjectPaths ? join(root, '.dev-db') : join(publicDir, 'knot-dev-db');

for (const [name, p] of [['도구 폴더', toolsDir], ['데이터 폴더', dataDir]]) {
  if (!isAscii(p)) {
    console.error(`${name} 경로에 한글 등 비ASCII 문자가 있어 사용할 수 없습니다: ${p}`);
    process.exit(1);
  }
}

// 로컬 전용 값 (비밀 아님). 127.0.0.1 에서만 접속 가능
const PORT = 54329;
const USER = 'knot';
const PASSWORD = 'knot_dev_only';
const DB = 'knot_dev';
const URL = `postgres://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DB}`;

const pkgEntry = join(toolsDir, 'node_modules', 'embedded-postgres', 'dist', 'index.js');

function requireInstalled() {
  if (!existsSync(pkgEntry)) {
    console.error(`PostgreSQL 패키지가 없습니다. 먼저 실행하세요: node scripts/dev-db.mjs setup  (설치 위치: ${toolsDir})`);
    process.exit(1);
  }
}

// 플랫폼별 바이너리 패키지에서 pg_ctl 위치 찾기 (stop 용)
function findPgCtl() {
  const base = join(toolsDir, 'node_modules', '@embedded-postgres');
  for (const dir of existsSync(base) ? readdirSync(base) : []) {
    for (const name of ['pg_ctl.exe', 'pg_ctl']) {
      const p = join(base, dir, 'native', 'bin', name);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

const cmd = process.argv[2];

if (cmd === 'url') {
  console.log(URL);
} else if (cmd === 'setup') {
  mkdirSync(toolsDir, { recursive: true });
  if (!existsSync(join(toolsDir, 'package.json'))) {
    writeFileSync(join(toolsDir, 'package.json'), JSON.stringify({ name: 'knot-dev-db-tools', private: true }, null, 2));
  }
  execSync(`npm install --save-exact ${PG_PACKAGE}`, { cwd: toolsDir, stdio: 'inherit' });
  console.log(`설치 완료: ${toolsDir}`);
} else if (cmd === 'stop') {
  const ctl = findPgCtl();
  if (!ctl || !existsSync(dataDir)) {
    console.log('종료할 DB가 없습니다.');
  } else {
    try {
      execFileSync(ctl, ['stop', '-D', dataDir, '-m', 'fast'], { stdio: 'inherit' });
    } catch {
      console.log('이미 종료되어 있습니다.');
    }
  }
} else if (cmd === 'reset') {
  if (!existsSync(dataDir)) {
    console.log('삭제할 데이터가 없습니다.');
  } else {
    try {
      rmSync(dataDir, { recursive: true, force: true });
      console.log(`개발 DB 데이터(${dataDir})를 삭제했습니다.`);
    } catch (e) {
      console.error(`삭제 실패: ${e.message}\nDB가 실행 중이면 먼저 'node scripts/dev-db.mjs stop' 으로 종료하세요.`);
      process.exit(1);
    }
  }
} else if (cmd === 'start') {
  requireInstalled();
  const { default: EmbeddedPostgres } = await import(pathToFileURL(pkgEntry).href);
  const fresh = !existsSync(join(dataDir, 'PG_VERSION'));
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    port: PORT,
    user: USER,
    password: PASSWORD,
    persistent: true,
    autoRehydrateSymlinks: true,
    // 한국어 이름 저장을 위해 UTF8 고정, 외부 접속 차단
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    postgresFlags: ['-c', 'listen_addresses=127.0.0.1'],
    onError: (m) => console.error(String(m).trim()),
    onLog: () => {},
  });

  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh) await pg.createDatabase(DB);

  console.log(`개발 DB 준비 완료: ${URL}`);
  const shutdown = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  setInterval(() => {}, 1 << 30); // 프로세스 유지
} else {
  console.error('사용법: node scripts/dev-db.mjs <setup | start | stop | reset | url>');
  process.exit(1);
}
