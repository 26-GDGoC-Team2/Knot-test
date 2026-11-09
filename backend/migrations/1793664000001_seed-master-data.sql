-- Up Migration
-- 선택 목록 기본 데이터 (실제 서비스에도 필요한 진짜 시드). 출처: 요구사항 정의서 REQ-004
-- 가짜/테스트 데이터는 이 파일에 넣지 않는다.
-- 기술/관심 분야는 정의서의 "예시" 목록이라 최종 목록이 아님 -> 추가/변경은 새 마이그레이션으로 한다.

-- 희망 역할 (REQ-004: PM, 디자인, FE, BE, AI, 앱)
INSERT INTO roles (name) VALUES ('PM'), ('디자인'), ('FE'), ('BE'), ('AI'), ('앱')
ON CONFLICT (name) DO NOTHING;

-- 기술 스택. name_norm = 소문자 + 공백 제거 (React/react 중복 방지)
INSERT INTO skills (name, name_norm, is_custom)
SELECT n, lower(regexp_replace(n, '\s', '', 'g')), FALSE
FROM unnest(ARRAY[
  'Python', 'Java', 'JavaScript', 'TypeScript', 'React', 'Next.js', 'Spring', 'FastAPI', 'Django',
  'Flutter', 'SQL', 'MySQL', 'PostgreSQL', 'PyTorch', 'TensorFlow', 'AWS', 'Docker', 'Figma'
]) AS n
ON CONFLICT (name_norm) DO NOTHING;

-- 관심 분야
INSERT INTO interest_areas (name) VALUES
  ('AI/ML'), ('생성형 AI·LLM'), ('데이터 분석'), ('프론트엔드'), ('백엔드'), ('앱'),
  ('UX/UI'), ('금융·핀테크'), ('헬스케어'), ('교육'), ('커머스')
ON CONFLICT (name) DO NOTHING;

-- Down Migration
-- 개발용 되돌리기. 이미 회원/모집글이 참조 중이면 FK 때문에 실패할 수 있다.
DELETE FROM interest_areas WHERE name IN
  ('AI/ML', '생성형 AI·LLM', '데이터 분석', '프론트엔드', '백엔드', '앱', 'UX/UI', '금융·핀테크', '헬스케어', '교육', '커머스');
DELETE FROM skills WHERE is_custom = FALSE AND name_norm IN
  ('python', 'java', 'javascript', 'typescript', 'react', 'next.js', 'spring', 'fastapi', 'django',
   'flutter', 'sql', 'mysql', 'postgresql', 'pytorch', 'tensorflow', 'aws', 'docker', 'figma');
DELETE FROM roles WHERE name IN ('PM', '디자인', 'FE', 'BE', 'AI', '앱');
