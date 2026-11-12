// 수료 지정 DTO 검증 (수료 기수는 1~999 정수, 생략/null 허용)
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SetGraduationDto } from './admin.dto';

const errors = (o: object) => validateSync(plainToInstance(SetGraduationDto, o)).length;

describe('SetGraduationDto', () => {
  it.each([[{ isGraduated: true }], [{ isGraduated: true, graduationCohort: 5 }], [{ isGraduated: false, graduationCohort: null }]])(
    '허용: %j',
    (o) => expect(errors(o)).toBe(0),
  );
  it.each([[{ isGraduated: true, graduationCohort: 0 }], [{ isGraduated: true, graduationCohort: -1 }],
    [{ isGraduated: true, graduationCohort: 1.5 }], [{ isGraduated: true, graduationCohort: '5' }],
    [{ isGraduated: true, graduationCohort: 1000 }], [{ graduationCohort: 3 }]])(
    '거부: %j',
    (o) => expect(errors(o)).toBeGreaterThan(0),
  );
});
