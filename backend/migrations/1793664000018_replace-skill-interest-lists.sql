-- Up Migration
-- 기술 스택 58개 · 관심 분야 21개 기본 목록으로 교체 (프론트 data.js 와 같은 목록).
-- 이미 있는 항목은 id 를 유지한 채 이름/종류만 맞춰서, 회원이 고른 값이 사라지지 않고 중복도 생기지 않게 한다.
DO $$
DECLARE
  v_skills    TEXT[] := ARRAY[
    'Android', 'AWS', 'C', 'C#', 'C++', 'Dart', 'Design System', 'Django', 'Docker', 'Express',
    'FAISS', 'FastAPI', 'Figma', 'Firebase', 'Flutter', 'GCP', 'Git', 'GraphQL', 'Java', 'JavaScript',
    'Jira', 'Kotlin', 'Kubernetes', 'LangChain', 'librosa', 'LightGBM', 'Linux', 'MongoDB', 'MySQL', 'NestJS',
    'Next.js', 'Node.js', 'Notion', 'OpenCV', 'Pandas', 'PostgreSQL', 'Power BI', 'Python', 'PyTorch', 'React',
    'React Native', 'Redis', 'scikit-learn', 'Spark', 'Spring', 'SQL', 'Swift', 'Tableau', 'Tailwind CSS', 'TensorFlow',
    'Transformers', 'TypeScript', 'Unity', 'Unreal Engine', 'UX Research', 'Vue', 'Whisper', 'XGBoost'
  ];
  v_interests TEXT[] := ARRAY[
    'AI/ML', 'LLM/생성형AI', 'NLP', '음성AI', '컴퓨터비전', '검색/추천', '데이터분석', 'AI서비스', 'UX/UI', '클라우드/인프라',
    '보안', '금융/핀테크', '커머스', '교육', '헬스케어', '커뮤니티', '동아리서비스', '게임', '모빌리티', '미디어/엔터',
    '공공/소셜임팩트'
  ];
BEGIN
  -- 기술: 있으면 기본 목록 항목으로 바꾸고(직접 입력으로 만들어졌던 Design System 등), 없으면 추가
  INSERT INTO skills (name, name_norm, is_custom)
  SELECT n, lower(regexp_replace(n, '\s', '', 'g')), FALSE
  FROM unnest(v_skills) AS n
  ON CONFLICT (name_norm) DO UPDATE SET name = EXCLUDED.name, is_custom = FALSE;

  -- 관심 분야: 이름만 바뀐 기존 항목은 이름을 바꿔 회원이 고른 값을 유지
  UPDATE interest_areas SET name = 'LLM/생성형AI'
   WHERE name = '생성형 AI·LLM' AND NOT EXISTS (SELECT 1 FROM interest_areas WHERE name = 'LLM/생성형AI');
  UPDATE interest_areas SET name = '데이터분석'
   WHERE name = '데이터 분석' AND NOT EXISTS (SELECT 1 FROM interest_areas WHERE name = '데이터분석');
  UPDATE interest_areas SET name = '금융/핀테크'
   WHERE name = '금융·핀테크' AND NOT EXISTS (SELECT 1 FROM interest_areas WHERE name = '금융/핀테크');

  -- 새 목록에 없는 항목(역할과 겹치는 프론트엔드·백엔드·앱 등)은 삭제. 연결된 회원 프로필·모집글 값도 함께 지운다
  DELETE FROM profile_interests
   WHERE interest_id IN (SELECT id FROM interest_areas WHERE name <> ALL (v_interests));
  DELETE FROM recruitment_interests
   WHERE interest_id IN (SELECT id FROM interest_areas WHERE name <> ALL (v_interests));
  DELETE FROM interest_areas WHERE name <> ALL (v_interests);

  -- 없는 항목은 목록 순서대로 추가
  INSERT INTO interest_areas (name)
  SELECT n FROM unnest(v_interests) WITH ORDINALITY AS t(n, ord) ORDER BY ord
  ON CONFLICT (name) DO NOTHING;
END $$;

-- Down Migration
-- 이름 변경·삭제된 항목은 되돌리지 않는다 (개발용 되돌리기 없음)
SELECT 1;
