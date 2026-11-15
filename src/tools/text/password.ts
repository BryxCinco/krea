/**
 * Tool 30: Password Generator & Strength Checker. The UI is an editor
 * (components/stage/editors/password-editor.tsx); the logic is in password-logic.ts.
 * Passwords are never saved, logged or sent anywhere.
 */
import { editorTool } from "./editor-tool";

export const password = editorTool({
  id: 30,
  slug: "password-generator",
  name: "Password Generator & Strength Checker",
  verb: "Make password",
  description: "Make strong random passwords and passphrases, and check how strong a password really is.",
  seoTitle: "Password Generator and Strength Checker: random passwords, passphrases, entropy",
  seoDescription:
    "Generate strong random passwords and passphrases with your browser's secure random numbers, or check a password's strength with an honest entropy estimate. Nothing is stored or sent.",
  howTo: [
    "Pick Random password or Passphrase, set the length and character types, and press Generate.",
    "Copy the one you like. Each shows its strength in bits of entropy, with what that means.",
    "Use Check strength to test a password. It stays on this page and is never saved or sent.",
  ],
  faqs: [
    { q: "Is the password I generate or check sent anywhere?", a: "No. Passwords are made with your browser's secure random number generator and checked on this page. Krea never saves, logs or uploads them, and nothing about the checker needs the internet." },
    { q: "How random are the generated passwords?", a: "They use crypto.getRandomValues, the same source browsers use for encryption keys, with an unbiased method of picking characters. Math.random is never used." },
    { q: "What are bits of entropy?", a: "A password with N bits of entropy takes about 2 to the power N guesses to find by trying everything. Every extra bit doubles the work. As a rough guide, under 40 bits is weak, 60 or more is strong, and 80 or more is out of reach for guessing today." },
    { q: "Does a high score mean a password cannot be hacked?", a: "No. Strength only covers guessing. A strong password can still be stolen by phishing, leaked in a data breach, or reused on a weaker site. Use a different password for each site and a password manager." },
    { q: "Why does the checker not look up leaked passwords online?", a: "Because that would send information about your password to another service. Instead it compares against a list of the 10,000 most common passwords that is built into Krea, and your password manager can run breach checks." },
  ],
  icon: "password",
});
