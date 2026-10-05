// Finds sentences that make a commercial ask. Rules, not a model: a sentence is
// commercial if it uses an unmistakable sales term, or pairs sales framing
// ("let's talk about") with a growth object ("your other clinics"). Mentioning
// seats or sites alone is not a pitch. A semantic check can replace this later.

const STRONG = /\b(pric(?:e|es|ing)|discount(?:s|ed)?|quote|upsell|expan(?:d|ding|sion)|upgrade|renewal terms|contract terms|footprint|(?:our|special|limited[- ]time|q[1-4]) offer)\b/i;
const GROWTH = /\b((?:more|additional|extra|new|other)\s+(?:\w+\s+)?(?:seats|licen[cs]es|sites|clinics|locations|offices|teams|departments)|roll(?:ing)?\s+(?:\w+\s+)?out|(?:bigger|higher|larger|premium|enterprise)\s+(?:\w+\s+)?(?:tier|plan|package|license|edition))\b/i;
const FRAMING = /\b(let's talk|let's discuss|talk about|discuss|conversation about|happy to|i'd love to|we could|we can|interested in|consider|explore|walk you through)\b/i;

export const splitSentences = (text: string) => text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);

export const isCommercial = (sentence: string) => STRONG.test(sentence) || (GROWTH.test(sentence) && FRAMING.test(sentence));

export const findCommercialSentences = (text: string) => splitSentences(text).filter(isCommercial);
