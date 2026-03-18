// Port of crimson/perks/ids.py

export enum PerkFlags {
  QUEST_MODE_ALLOWED = 0x1,
  MULTIPLAYER_ALLOWED = 0x2,
  STACKABLE = 0x4,
}

export const PERK_DEFAULT_FLAGS = PerkFlags.QUEST_MODE_ALLOWED | PerkFlags.MULTIPLAYER_ALLOWED;

export enum PerkId {
  ANTIPERK = 0,
  BLOODY_MESS_QUICK_LEARNER = 1,
  SHARPSHOOTER = 2,
  FASTLOADER = 3,
  LEAN_MEAN_EXP_MACHINE = 4,
  LONG_DISTANCE_RUNNER = 5,
  PYROKINETIC = 6,
  INSTANT_WINNER = 7,
  GRIM_DEAL = 8,
  ALTERNATE_WEAPON = 9,
  PLAGUEBEARER = 10,
  EVIL_EYES = 11,
  AMMO_MANIAC = 12,
  RADIOACTIVE = 13,
  FASTSHOT = 14,
  FATAL_LOTTERY = 15,
  RANDOM_WEAPON = 16,
  MR_MELEE = 17,
  ANXIOUS_LOADER = 18,
  FINAL_REVENGE = 19,
  TELEKINETIC = 20,
  PERK_EXPERT = 21,
  UNSTOPPABLE = 22,
  REGRESSION_BULLETS = 23,
  INFERNAL_CONTRACT = 24,
  POISON_BULLETS = 25,
  DODGER = 26,
  BONUS_MAGNET = 27,
  URANIUM_FILLED_BULLETS = 28,
  DOCTOR = 29,
  MONSTER_VISION = 30,
  HOT_TEMPERED = 31,
  BONUS_ECONOMIST = 32,
  THICK_SKINNED = 33,
  BARREL_GREASER = 34,
  AMMUNITION_WITHIN = 35,
  VEINS_OF_POISON = 36,
  TOXIC_AVENGER = 37,
  REGENERATION = 38,
  PYROMANIAC = 39,
  NINJA = 40,
  HIGHLANDER = 41,
  JINXED = 42,
  PERK_MASTER = 43,
  REFLEX_BOOSTED = 44,
  GREATER_REGENERATION = 45,
  BREATHING_ROOM = 46,
  DEATH_CLOCK = 47,
  MY_FAVOURITE_WEAPON = 48,
  BANDAGE = 49,
  ANGRY_RELOADER = 50,
  ION_GUN_MASTER = 51,
  STATIONARY_RELOADER = 52,
  MAN_BOMB = 53,
  FIRE_CAUGH = 54,
  LIVING_FORTRESS = 55,
  TOUGH_RELOADER = 56,
  LIFELINE_50_50 = 57,
}

export interface PerkMeta {
  readonly perkId: PerkId;
  readonly name: string;
  readonly description: string;
  readonly flags: number;
  readonly prereq: readonly PerkId[];
}

function pm(
  perkId: PerkId,
  name: string,
  description: string,
  flags: number,
  prereq: readonly PerkId[] = [],
): PerkMeta {
  return { perkId, name, description, flags, prereq };
}

const _PERK_TABLE: readonly PerkMeta[] = [
  pm(PerkId.ANTIPERK, 'AntiPerk', "You shouldn't be seeing this..", PERK_DEFAULT_FLAGS),
  pm(PerkId.BLOODY_MESS_QUICK_LEARNER, 'Bloody Mess', 'More the merrier. More blood guarantees a 30% better experience. You spill more blood and gain more experience points.', PERK_DEFAULT_FLAGS),
  pm(PerkId.SHARPSHOOTER, 'Sharpshooter', 'Miraculously your aiming improves drastically, but you take a little bit more time on actually firing the gun. If you order now, you also get a fancy LASER SIGHT without ANY charge!', PERK_DEFAULT_FLAGS),
  pm(PerkId.FASTLOADER, 'Fastloader', 'Man, you sure know how to load a gun.', PERK_DEFAULT_FLAGS),
  pm(PerkId.LEAN_MEAN_EXP_MACHINE, 'Lean Mean Exp Machine', 'Why kill for experience when you can make some of your own for free! With this perk the experience just keeps flowing in at a constant rate.', PERK_DEFAULT_FLAGS),
  pm(PerkId.LONG_DISTANCE_RUNNER, 'Long Distance Runner', "You move like a train that has feet and runs. You just need a little time to warm up. In other words you'll move faster the longer you run without stopping.", PERK_DEFAULT_FLAGS),
  pm(PerkId.PYROKINETIC, 'Pyrokinetic', 'You see flames everywhere. Bare aiming at creatures causes them to heat up.', PERK_DEFAULT_FLAGS),
  pm(PerkId.INSTANT_WINNER, 'Instant Winner', '2500 experience points. Right away. Take it or leave it.', PERK_DEFAULT_FLAGS | PerkFlags.STACKABLE),
  pm(PerkId.GRIM_DEAL, 'Grim Deal', "I'll make you a deal: I'll give you 18% more experience points, and you'll give me your life. So you'll die but score higher. Ponder that one for a sec.", 0),
  pm(PerkId.ALTERNATE_WEAPON, 'Alternate Weapon', "Ever fancied about having two weapons available for use? This might be your lucky day; with this perk you'll get an extra weapon slot for another gun! Carrying around two guns slows you down slightly though. (You can switch the weapon slots with RELOAD key)", PerkFlags.QUEST_MODE_ALLOWED),
  pm(PerkId.PLAGUEBEARER, 'Plaguebearer', 'You carry a horrible disease. Good for you: you are immune. Bad for them: it is contagious! (Monsters become resistant over time though.)', PERK_DEFAULT_FLAGS),
  pm(PerkId.EVIL_EYES, 'Evil Eyes', 'No living (nor dead) can resist the hypnotic power of your eyes: monsters freeze still as you look at them!', PERK_DEFAULT_FLAGS),
  pm(PerkId.AMMO_MANIAC, 'Ammo Maniac', "You squeeze and you push and you pack your clips with about 20% more ammo than a regular fellow. They call you Ammo Maniac with a deep respect in their voices.", PERK_DEFAULT_FLAGS),
  pm(PerkId.RADIOACTIVE, 'Radioactive', "You are the Radioactive-man; you have that healthy green glow around you! Others don't like it though, it makes them sick and nauseous whenever near you. It does affect your social life a bit.", PERK_DEFAULT_FLAGS),
  pm(PerkId.FASTSHOT, 'Fastshot', 'Funny how you make your gun spit bullets faster than the next guy. Even the most professional of engineers are astonished.', PERK_DEFAULT_FLAGS),
  pm(PerkId.FATAL_LOTTERY, 'Fatal Lottery', 'Fifty-fifty chance of dying OR gaining 10k experience points. Place your bets. Interested, anyone?', PerkFlags.STACKABLE),
  pm(PerkId.RANDOM_WEAPON, 'Random Weapon', 'Here, have this weapon. No questions asked.', PerkFlags.QUEST_MODE_ALLOWED | PerkFlags.STACKABLE),
  pm(PerkId.MR_MELEE, 'Mr. Melee', "You master the art of melee fighting. You don't just stand still when monsters come near -- you hit back. Hard.", PERK_DEFAULT_FLAGS),
  pm(PerkId.ANXIOUS_LOADER, 'Anxious Loader', 'When you can\'t stand waiting your gun to be reloaded you can speed up the process by clicking your FIRE button repeatedly as fast as you can.', PERK_DEFAULT_FLAGS),
  pm(PerkId.FINAL_REVENGE, 'Final Revenge', "Pick this and you'll get your revenge. It's a promise.", 0),
  pm(PerkId.TELEKINETIC, 'Telekinetic', "Picking up bonuses has never been so easy and FUN. You can pick up bonuses simply by aiming at them for a while. Ingenious.", PERK_DEFAULT_FLAGS),
  pm(PerkId.PERK_EXPERT, 'Perk Expert', "You sure know how to pick a perk -- most people just don't see that extra perk laying around. This gives you the opportunity to pick the freshest and shiniest perks from the top.", PERK_DEFAULT_FLAGS),
  pm(PerkId.UNSTOPPABLE, 'Unstoppable', "Monsters can't slow you down with their nasty scratches and bites. It still hurts but you simply ignore the pain.", PERK_DEFAULT_FLAGS),
  pm(PerkId.REGRESSION_BULLETS, 'Regression Bullets', "Attempt to shoot with an empty clip leads to a severe loss of experience. But hey, whatever makes them go down, right?", PERK_DEFAULT_FLAGS),
  pm(PerkId.INFERNAL_CONTRACT, 'Infernal Contract', 'In exchange for your soul, a dark stranger is offering you three (3) new perks. To collect his part of the bargain soon enough, your health is reduced to a near-death status. Just sign down here below this pentagram..', PERK_DEFAULT_FLAGS),
  pm(PerkId.POISON_BULLETS, 'Poison Bullets', 'You tend to explicitly treat each of your bullets with rat poison. You do it for good luck, but it seems to have other side effects too.', PERK_DEFAULT_FLAGS),
  pm(PerkId.DODGER, 'Dodger', "It seems so stupid just to take the hits. Each time a monster attacks you you have a chance to dodge the attack.", PERK_DEFAULT_FLAGS),
  pm(PerkId.BONUS_MAGNET, 'Bonus Magnet', 'You somehow seem to lure all kinds of bonuses to appear around you more often.', PERK_DEFAULT_FLAGS),
  pm(PerkId.URANIUM_FILLED_BULLETS, 'Uranium Filled Bullets', "Your bullets have a nice creamy uranium filling. Yummy. Now that's gotta hurt the monsters more, right?", PERK_DEFAULT_FLAGS),
  pm(PerkId.DOCTOR, 'Doctor', 'With a single glance you can tell the medical condition of, well, anything. Also, being a doctor, you know exactly what hurts the most enabling you to do slightly more damage with your attacks.', PERK_DEFAULT_FLAGS),
  pm(PerkId.MONSTER_VISION, 'Monster Vision', "With your newly enhanced senses you can see all bad energy VERY clearly. That's got to be enough.", PERK_DEFAULT_FLAGS),
  pm(PerkId.HOT_TEMPERED, 'Hot Tempered', "It literally boils inside you. That's exactly why you need to let it out once in a while, unfortunately for those near you.", PERK_DEFAULT_FLAGS),
  pm(PerkId.BONUS_ECONOMIST, 'Bonus Economist', 'Your bonus power-ups last 50% longer than they normally would.', PERK_DEFAULT_FLAGS),
  pm(PerkId.THICK_SKINNED, 'Thick Skinned', 'Trade 1/3 of your health for only receiving 2/3rds damage on attacks.', PERK_DEFAULT_FLAGS),
  pm(PerkId.BARREL_GREASER, 'Barrel Greaser', "After studying a lot of physics and friction you've come up with a way to make your bullets fly faster. More speed, more damage.", PERK_DEFAULT_FLAGS),
  pm(PerkId.AMMUNITION_WITHIN, 'Ammunition Within', "Empty clip doesn't prevent you from shooting with a weapon; instead the ammunition is drawn from your health while you are reloading.", PERK_DEFAULT_FLAGS),
  pm(PerkId.VEINS_OF_POISON, 'Veins of Poison', 'A strong poison runs through your veins. Monsters taking a bite of you are eventually to experience an agonizing death.', PERK_DEFAULT_FLAGS),
  pm(PerkId.TOXIC_AVENGER, 'Toxic Avenger', "You started out just by being poisonous. The next logical step for you is to become highly toxic -- the ULTIMATE TOXIC AVENGER. Most monsters touching you will just drop dead within seconds!", PERK_DEFAULT_FLAGS, [PerkId.VEINS_OF_POISON]),
  pm(PerkId.REGENERATION, 'Regeneration', 'Your health replenishes but very slowly. What more there is to say?', PERK_DEFAULT_FLAGS),
  pm(PerkId.PYROMANIAC, 'Pyromaniac', "You just enjoy using fire as your Tool of Destruction and you're good at it too; your fire based weapons do a lot more damage.", PERK_DEFAULT_FLAGS),
  pm(PerkId.NINJA, 'Ninja', "You've taken your dodging abilities to the next level; monsters have really hard time hitting you.", PERK_DEFAULT_FLAGS, [PerkId.DODGER]),
  pm(PerkId.HIGHLANDER, 'Highlander', "You are immortal. Well, almost immortal. Instead of actually losing health on attacks you've got a 10% chance of just dropping dead whenever a monster attacks you. There really can be only one, you know.", 0),
  pm(PerkId.JINXED, 'Jinxed', 'Things happen near you. Strangest things. Creatures just drop dead and accidents happen. Beware.', PERK_DEFAULT_FLAGS),
  pm(PerkId.PERK_MASTER, 'Perk Master', 'Being the Perk Expert taught you a few things and now you are ready to take your training to the next level doubling the ability effect.', PERK_DEFAULT_FLAGS, [PerkId.PERK_EXPERT]),
  pm(PerkId.REFLEX_BOOSTED, 'Reflex Boosted', 'To you the world seems to go on about 10% slower than to an average person. It can be rather irritating sometimes, but it does give you a chance to react better.', PERK_DEFAULT_FLAGS),
  pm(PerkId.GREATER_REGENERATION, 'Greater Regeneration', 'Your health replenishes faster than ever.', PERK_DEFAULT_FLAGS, [PerkId.REGENERATION]),
  pm(PerkId.BREATHING_ROOM, 'Breathing Room', "Trade 2/3rds of your health for the killing of every single creature on the screen. No, you don't get the experience.", PerkFlags.MULTIPLAYER_ALLOWED),
  pm(PerkId.DEATH_CLOCK, 'Death Clock', "You die exactly in 30 seconds. You can't escape your destiny, but feel free to go on a spree. Tick, tock.", PERK_DEFAULT_FLAGS),
  pm(PerkId.MY_FAVOURITE_WEAPON, 'My Favourite Weapon', "You've grown very fond of your piece. You polish it all the time and talk nice to it, your precious. (+2 clip size, no more random weapon bonuses)", PERK_DEFAULT_FLAGS),
  pm(PerkId.BANDAGE, 'Bandage', "Here, eat this bandage and you'll feel a lot better in no time. (restores up to 50% health)", PERK_DEFAULT_FLAGS),
  pm(PerkId.ANGRY_RELOADER, 'Angry Reloader', "You hate it when you run out of shots. You HATE HATE HATE reloading your gun. Lucky for you, and strangely enough, your hate materializes as Mighty Balls of Fire. Or more like Quite Decent Balls of Fire, but it's still kinda neat, huh?", PERK_DEFAULT_FLAGS),
  pm(PerkId.ION_GUN_MASTER, 'Ion Gun Master', "You're good with ion weapons. You're so good that not only your shots do slightly more damage but your ion blast radius is also increased.", PERK_DEFAULT_FLAGS),
  pm(PerkId.STATIONARY_RELOADER, 'Stationary Reloader', "It's incredibly hard to reload your piece while moving around, you've noticed. In fact, realizing that, when you don't move a (leg) muscle you can reload the gun THREE TIMES FASTER!", PERK_DEFAULT_FLAGS),
  pm(PerkId.MAN_BOMB, 'Man Bomb', 'You have the ability to go boom for you are the MAN BOMB. Going boom requires a lot of concentration and standing completely still for a few seconds.', PERK_DEFAULT_FLAGS),
  pm(PerkId.FIRE_CAUGH, 'Fire Caugh', 'You have a fireball stuck in your throat. Repeatedly. Mind your manners.', PERK_DEFAULT_FLAGS),
  pm(PerkId.LIVING_FORTRESS, 'Living Fortress', "It comes a time in each man's life when you'd just rather not move anymore. Being living fortress not moving comes with extra benefits as well. You do the more damage the longer you stand still.", PERK_DEFAULT_FLAGS),
  pm(PerkId.TOUGH_RELOADER, 'Tough Reloader', 'Damage received during reloading a weapon is halved.', PERK_DEFAULT_FLAGS),
  pm(PerkId.LIFELINE_50_50, 'Lifeline 50-50', "The computer removes half of the wrong monsters for you. You don't gain any experience.", PERK_DEFAULT_FLAGS),
];

export const PERK_BY_ID: Map<PerkId, PerkMeta> = new Map(
  _PERK_TABLE.map((e) => [e.perkId, e]),
);

export const QUICK_LEARNER_NAME = 'Quick Learner';
export const QUICK_LEARNER_DESCRIPTION =
  'You learn things faster than a regular Joe from now on gaining 30% more experience points from everything you do.';

const _PERK_FIXED_NAMES: Map<PerkId, string> = new Map([
  [PerkId.FIRE_CAUGH, 'Fire Cough'],
]);

const _PERK_FIXED_DESCRIPTIONS: Map<PerkId, string> = new Map([
  [PerkId.ANXIOUS_LOADER, "When you can't stand waiting for your gun to be reloaded you can speed up the process by clicking your FIRE button repeatedly as fast as you can."],
  [PerkId.PERK_EXPERT, "You sure know how to pick a perk -- most people just don't see that extra perk laying around. This gives you the opportunity to pick the freshest and shiniest perks from the top."],
  [PerkId.DODGER, 'It seems so stupid just to take the hits. Each time a monster attacks you, you have a chance to dodge the attack.'],
  [PerkId.NINJA, "You've taken your dodging abilities to the next level; monsters have a really hard time hitting you."],
  [PerkId.LIVING_FORTRESS, "There comes a time in each man's life when you'd just rather not move anymore. Being a living fortress comes with extra benefits as well. You do more damage the longer you stand still."],
]);

export function perkDisplayName(
  perkId: PerkId,
  violenceDisabled = 0,
  preserveBugs = false,
): string {
  if (perkId === PerkId.BLOODY_MESS_QUICK_LEARNER && violenceDisabled !== 0) {
    return QUICK_LEARNER_NAME;
  }
  const entry = PERK_BY_ID.get(perkId);
  if (!entry) return `perk_${perkId}`;
  if (!preserveBugs) {
    const fixed = _PERK_FIXED_NAMES.get(perkId);
    if (fixed !== undefined) return fixed;
  }
  return entry.name;
}

export function perkDisplayDescription(
  perkId: PerkId,
  violenceDisabled = 0,
  preserveBugs = false,
): string {
  if (perkId === PerkId.BLOODY_MESS_QUICK_LEARNER && violenceDisabled !== 0) {
    return QUICK_LEARNER_DESCRIPTION;
  }
  const entry = PERK_BY_ID.get(perkId);
  if (!entry) return '';
  if (!preserveBugs) {
    const fixed = _PERK_FIXED_DESCRIPTIONS.get(perkId);
    if (fixed !== undefined) return fixed;
  }
  return entry.description;
}

export function perkLabel(
  perkId: PerkId,
  violenceDisabled = 0,
  preserveBugs = false,
): string {
  return perkDisplayName(perkId, violenceDisabled, preserveBugs);
}
