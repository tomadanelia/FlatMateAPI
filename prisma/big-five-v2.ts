export type BigFiveQuestion = readonly [
  code: string,
  prompt: string,
  trait:
    | "extraversion"
    | "agreeableness"
    | "conscientiousness"
    | "neuroticism"
    | "openness",
  reverseScored: boolean,
];

// IPIP 50-item Big-Five factor markers. Factor 4 is published as Emotional
// Stability; its keys are inverted here because Flatmate's canonical trait is
// the opposite construct, neuroticism. This keeps v1 and v2 scores comparable.
export const bigFiveV2Questions: readonly BigFiveQuestion[] = [
  ["IPIP50_01", "Am the life of the party.", "extraversion", false],
  ["IPIP50_02", "Feel little concern for others.", "agreeableness", true],
  ["IPIP50_03", "Am always prepared.", "conscientiousness", false],
  ["IPIP50_04", "Get stressed out easily.", "neuroticism", false],
  ["IPIP50_05", "Have a rich vocabulary.", "openness", false],
  ["IPIP50_06", "Don't talk a lot.", "extraversion", true],
  ["IPIP50_07", "Am interested in people.", "agreeableness", false],
  ["IPIP50_08", "Leave my belongings around.", "conscientiousness", true],
  ["IPIP50_09", "Am relaxed most of the time.", "neuroticism", true],
  [
    "IPIP50_10",
    "Have difficulty understanding abstract ideas.",
    "openness",
    true,
  ],
  ["IPIP50_11", "Feel comfortable around people.", "extraversion", false],
  ["IPIP50_12", "Insult people.", "agreeableness", true],
  ["IPIP50_13", "Pay attention to details.", "conscientiousness", false],
  ["IPIP50_14", "Worry about things.", "neuroticism", false],
  ["IPIP50_15", "Have a vivid imagination.", "openness", false],
  ["IPIP50_16", "Keep in the background.", "extraversion", true],
  ["IPIP50_17", "Sympathize with others' feelings.", "agreeableness", false],
  ["IPIP50_18", "Make a mess of things.", "conscientiousness", true],
  ["IPIP50_19", "Seldom feel blue.", "neuroticism", true],
  ["IPIP50_20", "Am not interested in abstract ideas.", "openness", true],
  ["IPIP50_21", "Start conversations.", "extraversion", false],
  [
    "IPIP50_22",
    "Am not interested in other people's problems.",
    "agreeableness",
    true,
  ],
  ["IPIP50_23", "Get chores done right away.", "conscientiousness", false],
  ["IPIP50_24", "Am easily disturbed.", "neuroticism", false],
  ["IPIP50_25", "Have excellent ideas.", "openness", false],
  ["IPIP50_26", "Have little to say.", "extraversion", true],
  ["IPIP50_27", "Have a soft heart.", "agreeableness", false],
  [
    "IPIP50_28",
    "Often forget to put things back in their proper place.",
    "conscientiousness",
    true,
  ],
  ["IPIP50_29", "Get upset easily.", "neuroticism", false],
  ["IPIP50_30", "Do not have a good imagination.", "openness", true],
  [
    "IPIP50_31",
    "Talk to a lot of different people at parties.",
    "extraversion",
    false,
  ],
  ["IPIP50_32", "Am not really interested in others.", "agreeableness", true],
  ["IPIP50_33", "Like order.", "conscientiousness", false],
  ["IPIP50_34", "Change my mood a lot.", "neuroticism", false],
  ["IPIP50_35", "Am quick to understand things.", "openness", false],
  [
    "IPIP50_36",
    "Don't like to draw attention to myself.",
    "extraversion",
    true,
  ],
  ["IPIP50_37", "Take time out for others.", "agreeableness", false],
  ["IPIP50_38", "Shirk my duties.", "conscientiousness", true],
  ["IPIP50_39", "Have frequent mood swings.", "neuroticism", false],
  ["IPIP50_40", "Use difficult words.", "openness", false],
  [
    "IPIP50_41",
    "Don't mind being the center of attention.",
    "extraversion",
    false,
  ],
  ["IPIP50_42", "Feel others' emotions.", "agreeableness", false],
  ["IPIP50_43", "Follow a schedule.", "conscientiousness", false],
  ["IPIP50_44", "Get irritated easily.", "neuroticism", false],
  ["IPIP50_45", "Spend time reflecting on things.", "openness", false],
  ["IPIP50_46", "Am quiet around strangers.", "extraversion", true],
  ["IPIP50_47", "Make people feel at ease.", "agreeableness", false],
  ["IPIP50_48", "Am exacting in my work.", "conscientiousness", false],
  ["IPIP50_49", "Often feel blue.", "neuroticism", false],
  ["IPIP50_50", "Am full of ideas.", "openness", false],
] as const;
