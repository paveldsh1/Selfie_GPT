export const ui = {
  askUpload: 'Upload a selfie.',
  notHuman: "send a photo with a person's face",
  indecent: 'Please send a photo within the bounds of decency.',
  topMenu: 'MENU:\n1. Selfie\n2. YXO\n3. Bot3',
  askSelectBot: 'Please choose a bot from the menu above.',
  yxoRedirect: 'YXO bot is handled separately. Please select "Selfie" to continue here.',
  bot3Redirect: 'Bot3 is handled separately. Please select "Selfie" to continue here.',
  mainMenu: 'What to do with a selfie?\n1. Edit while maintaining realism\n2. Stylize (artistically)\n3. Add a scene or effect',
  askRealismDetail: 'Select the type of changes:\na) Glasses, jewelry, tattoo\nb) Makeup, emotions\nc) Hair, beard, mustache\nd) Clothes\ne) Background and objects\nf) Enter your own option',
  
  // Примеры для реализма
  realismExamples: {
    a: 'Examples:\n• Round glasses and nose ring\n• Gold earrings and small tattoo',
    b: 'Examples:\n• Red lipstick and smoky eyes\n• Happy smile and rosy cheeks',
    c: 'Examples:\n• Short blonde hair\n• Long beard and mustache',
    d: 'Examples:\n• Black leather jacket\n• Elegant blue dress',
    e: 'Examples:\n• City street background\n• Add coffee cup in hand',
    f: 'Examples:\n• Add sunglasses and hat\n• Change to evening lighting'
  },
  askStylizeDetail: 'Select style:\na) Anime/Cartoon/Comic\nb) Painting: Watercolor, Oil, Pencil\nc) Full Art Portrait\nd) Fantasy/Sci-Fi Character\ne) Change Age, Gender, Ethnicity\nf) Enter your own',
  askSceneDetail: 'Select:\na) Change facial expression (smile, anger...)\nb) Add atmosphere (rain, sunset...)\nc) Create scene (mage, pilot, etc.)\nd) Enter your own',
  
  // Примеры для стилизации
  stylizeExamples: {
    a: 'Examples:\n• Cute anime hero\n• Dark comic style',
    b: 'Examples:\n• Oil painted portrait\n• Soft watercolor face', 
    c: 'Examples:\n• Renaissance royal pose\n• Modern studio shot',
    d: 'Examples:\n• Elf forest warrior\n• Futuristic cyborg soldier',
    e: 'Examples:\n• Young male version\n• Elder Asian woman',
    f: 'Examples:\n• Gothic vampire queen\n• Neon cyberpunk girl'
  },
  
  // Примеры для сцен и эффектов
  sceneExamples: {
    a: 'Examples:\n• Big happy smile\n• Angry serious face',
    b: 'Examples:\n• Golden sunset light\n• Heavy summer rain',
    c: 'Examples:\n• Brave space pilot\n• Ancient fire mage', 
    d: 'Examples:\n• Cyberpunk neon street\n• Romantic candle dinner'
  },
  resultMore: 'Here is the result. Do you want to change anything else?\n1. Add another effect to the result\n2. Add an effect to the original photo\n3. Finish',
  listCta: 'See all previous photos, write LIST',
  listHint: (remaining: number) => `Write "+" to show more (${remaining} left), write "-" to delete all your photos from the server.\nWrite "end" to upload new photo\nWrite "delete" to delete all your profile`,
  listEndHint: 'Write "menu" to Menu\nWrite "del" to delete all your profile',
  askOwnOption: 'Please describe in English.',
  templateIntro: 'Here is a ready-to-edit template. Reply with the edited block to apply:',
  templateFilled: (base: 'ORIGINAL' | 'RESULT', size: string) =>
    `Category: Stylize\nSubcategory: b\nDescription: Anime portrait with starry background\nBase: ${base}\nSize: ${size}`,
  finishOk: 'Okay. Type "menu" anytime to continue.'
};





