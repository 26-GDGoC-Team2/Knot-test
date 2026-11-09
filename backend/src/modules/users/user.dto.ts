// 다른 회원에게 보여주는 공개 회원 정보 DTO.
// 모집글 작성자, 확정 팀원, 부원 목록 등 회원이 노출되는 모든 응답은 이 변환을 거쳐야 한다.
export const WITHDRAWN_NAME = '탈퇴한 회원';

export interface PublicUser {
  id: string;
  name: string; // 탈퇴 회원은 실명 대신 "탈퇴한 회원"
  withdrawn: boolean;
}

// 이메일, google_sub 등 식별 정보는 포함하지 않는다.
export function toPublicUser(user: { id: string; name: string; status: 'ACTIVE' | 'WITHDRAWN' }): PublicUser {
  const withdrawn = user.status === 'WITHDRAWN';
  return { id: user.id, name: withdrawn ? WITHDRAWN_NAME : user.name, withdrawn };
}
