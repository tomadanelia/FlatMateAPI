import { Gender, LookingFor, Prisma } from "../generated/prisma/client";

/** Audience values that permit a user with the supplied gender. */
export function allowedAudiencesForGender(
  gender: Gender | null | undefined,
): LookingFor[] {
  switch (gender) {
    case Gender.MAN:
      return [LookingFor.male, LookingFor.all];
    case Gender.WOMAN:
      return [LookingFor.female, LookingFor.all];
    default:
      return [LookingFor.all];
  }
}

/** Database predicate used when selecting profiles visible to a viewer. */
export function visibleToGenderWhere(
  gender: Gender | null | undefined,
): Prisma.UserWhereInput {
  return { lookingFor: { in: allowedAudiencesForGender(gender) } };
}

/** Gender predicate for profiles a user has chosen to see. */
export function wantedGenderWhere(
  lookingFor: LookingFor,
): Prisma.UserWhereInput | undefined {
  switch (lookingFor) {
    case LookingFor.male:
      return { gender: Gender.MAN };
    case LookingFor.female:
      return { gender: Gender.WOMAN };
    default:
      return undefined;
  }
}

export function permitsGender(
  lookingFor: LookingFor,
  gender: Gender | null | undefined,
) {
  return allowedAudiencesForGender(gender).includes(lookingFor);
}
