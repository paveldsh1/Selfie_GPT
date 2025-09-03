export const ui = {
  askUpload: 'Upload a selfie.',
  notHuman: "send a photo with a person's face",
  indecent: 'Please send a photo within the bounds of decency.',
  topMenu: 'MENU:\n1. Selfie\n2. YXO\n3. Bot3',
  askSelectBot: 'Please choose a bot from the menu above.',
  yxoRedirect: 'YXO bot is handled separately. Please select "Selfie" to continue here.',
  bot3Redirect: 'Bot3 is handled separately. Please select "Selfie" to continue here.',
  mainMenu: 'What to do with a selfie?\n1. Edit while maintaining realism\n2. Stylize (artistically)\n3. Add a scene or effect',
  realismMenu: 'Select the type of changes:\n a) Glasses, jewelry, tattoo\n b) Makeup, emotions\n c) Hair, beard, mustache\n d) Clothes\n e) Background and objects\n f) Enter your own option',
  stylizeMenu: 'Select style:\n a) Anime/Cartoon/Comic\n b) Painting: Watercolor, Oil, Pencil\n c) Full Art Portrait\n d) Fantasy/Sci-Fi Character\n e) Change Age, Gender, Ethnicity\n f) Enter your own',
  sceneMenu: 'Select:\n a) Change facial expression (smile, anger...)\n b) Add atmosphere (rain, sunset...)\n c) Create scene (mage, pilot, etc.)\n d) Enter your own',
  resultMore: 'Here is the result. Do you want to change anything else?\n1. Add another effect to the result\n2. Add an effect to the original photo\n3. Finish',
  listCta: 'See all previous photos, write LIST',
  listHint: (count: number) => `Write "+" to upload more, write "-" to delete all your photos from the server, there are currently ${count} of them.\nWrite "end" to upload new photo\nWrite "delete" to delete all your profile`,
  listEndHint: 'Write "end" to Menu\nWrite "del" to delete all your profile',
  askRealismDetail: 'Select the type of changes:\n a) Glasses, jewelry, tattoo\n b) Makeup, emotions\n c) Hair, beard, mustache\n d) Clothes\n e) Background and objects\n f) Enter your own option',
  askStylizeDetail: 'Select style:\n a) Anime/Cartoon/Comic\n b) Painting: Watercolor, Oil, Pencil\n c) Full Art Portrait\n d) Fantasy/Sci-Fi Character\n e) Change Age, Gender, Ethnicity\n f) Enter your own',
  askSceneDetail: 'Select:\n a) Change facial expression (smile, anger...)\n b) Add atmosphere (rain, sunset...)\n c) Create scene (mage, pilot, etc.)\n d) Enter your own',
  askOwnOption: 'Please describe in English.',
  templateIntro: 'Here is a ready-to-edit template. Reply with the edited block to apply:',
  templateFilled: (base: 'ORIGINAL' | 'RESULT', size: string) =>
    `Category: Stylize\nSubcategory: b\nDescription: Anime portrait with starry background\nBase: ${base}\nSize: ${size}`,
  finishOk: 'Okay. Type "menu" anytime to continue.'
};





