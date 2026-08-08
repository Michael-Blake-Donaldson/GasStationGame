import type { BusinessDefinition, RetailProductDefinition } from './business';
import type { Employee } from './types';

export interface ServicePerformanceSnapshot {
  readonly adjustedServiceClockUnits: number;
  readonly baseErrorChancePermille: number;
  readonly baseServiceClockUnits: number;
  readonly employeeId: string;
  readonly errorChancePermille: number;
  readonly errorOccurred: boolean;
  readonly errorReworkClockUnits: number;
  readonly errorRoll: number;
  readonly fatigue: number;
  readonly fatigueErrorPenaltyPermille: number;
  readonly fatigueSpeedPenaltyPermille: number;
  readonly fatigueTier: number;
  readonly rngDrawCount: number;
  readonly skillErrorReductionPermille: number;
  readonly skillId: string;
  readonly skillLevel: number;
  readonly skillSpeedReductionPermille: number;
  readonly speedPermille: number;
  readonly totalClockUnits: number;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

export const serviceSkillLevel = (
  employee: Pick<Employee, 'skills'>,
  skillId: string,
): number => employee.skills.find((skill) => skill.id === skillId)?.level ?? 0;

export const calculateServicePerformance = (
  employee: Pick<Employee, 'fatigue' | 'id' | 'skills'>,
  product: RetailProductDefinition,
  rules: BusinessDefinition['performanceRules'],
  errorRoll: number,
  rngDrawCount: number,
): ServicePerformanceSnapshot => {
  const skillLevel = serviceSkillLevel(employee, product.serviceSkillId);
  const fatigueTier = Math.floor(employee.fatigue / 10);
  const skillSpeedReductionPermille =
    skillLevel * rules.skillSpeedReductionPermillePerLevel;
  const fatigueSpeedPenaltyPermille =
    fatigueTier * rules.fatigueSpeedPenaltyPermillePerTen;
  const speedPermille = clamp(
    1000 - skillSpeedReductionPermille + fatigueSpeedPenaltyPermille,
    500,
    2000,
  );
  const adjustedServiceClockUnits = Math.ceil(
    (product.serviceClockUnits * speedPermille) / 1000,
  );
  const skillErrorReductionPermille =
    skillLevel * rules.skillErrorReductionPermillePerLevel;
  const fatigueErrorPenaltyPermille =
    fatigueTier * rules.fatigueErrorPenaltyPermillePerTen;
  const errorChancePermille = clamp(
    product.baseErrorChancePermille -
      skillErrorReductionPermille +
      fatigueErrorPenaltyPermille,
    0,
    rules.maximumErrorChancePermille,
  );
  const errorOccurred = errorRoll < errorChancePermille;
  const errorReworkClockUnits = errorOccurred ? product.errorReworkClockUnits : 0;
  return {
    adjustedServiceClockUnits,
    baseErrorChancePermille: product.baseErrorChancePermille,
    baseServiceClockUnits: product.serviceClockUnits,
    employeeId: employee.id,
    errorChancePermille,
    errorOccurred,
    errorReworkClockUnits,
    errorRoll,
    fatigue: employee.fatigue,
    fatigueErrorPenaltyPermille,
    fatigueSpeedPenaltyPermille,
    fatigueTier,
    rngDrawCount,
    skillErrorReductionPermille,
    skillId: product.serviceSkillId,
    skillLevel,
    skillSpeedReductionPermille,
    speedPermille,
    totalClockUnits: adjustedServiceClockUnits + errorReworkClockUnits,
  };
};
