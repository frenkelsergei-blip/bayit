// Bilingual (Hebrew/English) shopping item dictionary.
// matchItem(text) → {icon, group, key} picks a real Bayit grocery/activity icon (or an OpenMoji code from the
// licensed catalog) and a shopping category for what someone types, in either language, with plural/singular,
// the ה־ prefix, final letters, niqqud and geresh spellings. iconSearch(query) gives icon ids for the icon picker.
const B=s=>'bayit-groceries-'+s,A=s=>'bayit-activities-'+s;

// Built-in shopping categories: [key, Hebrew label, icon]. Keys are stored on items, so never rename them.
export const SHOPPING_CATEGORIES=[
 ['Produce','ירקות ופירות','1F345'],['Dairy','מוצרי חלב','1F95B'],['Meat & fish','בשר ודגים',B('chicken')],['Bakery','מאפים','1F35E'],
 ['Pantry','מזווה','1FAD2'],['Frozen','קפואים','1F9CA'],['Drinks','משקאות',B('water')],['Snacks','חטיפים ומתוקים',B('chocolate')],
 ['Household','לבית','1F9FC'],['Personal care','טיפוח והיגיינה',A('toothpaste')],['Baby','תינוקות','1F37C'],['Pets','חיות מחמד',A('pet-food')],
 ['Other','אחר','1F6D2']];
export const SHOPPING_CATEGORY_KEYS=SHOPPING_CATEGORIES.map(c=>c[0]);
export const FALLBACK_ITEM={icon:'1F6D2',group:'Other',key:null};

// [key, icon, group, English names, Hebrew names]
export const ITEMS=[
 // Produce
 ['tomato',B('tomatoes'),'Produce',['tomato','tomatoes','cherry tomatoes','cherry tomato'],['עגבניה','עגבנייה','עגבניות','עגבניות שרי','עגבניית שרי','שרי']],
 ['cucumber',B('cucumber'),'Produce',['cucumber','cucumbers'],['מלפפון','מלפפונים','מלפפוני','מלפפוני בייבי']],
 ['apple',B('apple'),'Produce',['apple','apples','green apple'],['תפוח','תפוחים','תפוח עץ','תפוחי עץ','תפוחים ירוקים']],
 ['banana',B('banana'),'Produce',['banana','bananas'],['בננה','בננות']],
 ['orange',B('orange'),'Produce',['orange','oranges','clementine','clementines','mandarin','mandarins','tangerine','tangerines'],['תפוז','תפוזים','קלמנטינה','קלמנטינות','מנדרינה','מנדרינות','אשכולית','אשכוליות']],
 ['lemon',B('lemon'),'Produce',['lemon','lemons','lime','limes'],['לימון','לימונים','ליים','לימונים ירוקים']],
 ['avocado',B('avocado'),'Produce',['avocado','avocados'],['אבוקדו','אבוקדואים']],
 ['carrot',B('carrot'),'Produce',['carrot','carrots'],['גזר','גזרים']],
 ['potato',B('potato'),'Produce',['potato','potatoes'],['תפוח אדמה','תפוחי אדמה','תפו"א','תפוא','תפודים','תפוד']],
 ['sweet-potato','1F360','Produce',['sweet potato','sweet potatoes','yam'],['בטטה','בטטות']],
 ['onion',B('onion'),'Produce',['onion','onions','red onion','green onion','spring onion','shallot'],['בצל','בצלים','בצל סגול','בצל ירוק','שאלוט']],
 ['garlic','1F9C4','Produce',['garlic'],['שום','ראש שום','שיני שום']],
 ['lettuce',B('lettuce'),'Produce',['lettuce','salad greens','cabbage','romaine','iceberg'],['חסה','חסות','כרוב','כרוב סגול','חסה ערבית','לבבות חסה']],
 ['greens','1F96C','Produce',['spinach','kale','celery','leafy greens','arugula','chard'],['תרד','קייל','סלרי','רוקט','רוקולה','מנגולד','עלים ירוקים']],
 ['broccoli',B('broccoli'),'Produce',['broccoli','cauliflower'],['ברוקולי','כרובית']],
 ['pepper',B('pepper'),'Produce',['pepper','peppers','bell pepper','bell peppers','capsicum'],['פלפל','פלפלים','גמבה','פלפל אדום','פלפל צהוב','פלפל ירוק']],
 ['chili','1F336','Produce',['chili','chilli','hot pepper','jalapeno'],['פלפל חריף','פלפלים חריפים','צ\'ילי','צילי','חלפיניו']],
 ['mushrooms',B('mushrooms'),'Produce',['mushroom','mushrooms','champignon'],['פטריה','פטרייה','פטריות','שמפיניון','פורטובלו']],
 ['strawberries',B('strawberries'),'Produce',['strawberry','strawberries'],['תות','תותים','תות שדה','תותי שדה']],
 ['grapes',B('grapes'),'Produce',['grape','grapes'],['ענב','ענבים','אשכול ענבים']],
 ['watermelon',B('watermelon'),'Produce',['watermelon','watermelons'],['אבטיח','אבטיחים']],
 ['melon','1F348','Produce',['melon','melons','cantaloupe','honeydew'],['מלון','מלונים']],
 ['pear',B('pear'),'Produce',['pear','pears'],['אגס','אגסים']],
 ['peach',B('peach'),'Produce',['peach','peaches','nectarine','nectarines','apricot','apricots','plum','plums'],['אפרסק','אפרסקים','נקטרינה','נקטרינות','משמש','משמשים','שזיף','שזיפים']],
 ['berries',B('berries'),'Produce',['berries','blueberries','blueberry','raspberries','raspberry','blackberries'],['פירות יער','אוכמניות','אוכמנית','פטל','פטלים']],
 ['mango','1F96D','Produce',['mango','mangos','mangoes'],['מנגו','מנגואים']],
 ['pineapple','1F34D','Produce',['pineapple','pineapples'],['אננס','אננסים']],
 ['kiwi','1F95D','Produce',['kiwi','kiwis'],['קיווי','קיוי']],
 ['cherries','1F352','Produce',['cherry','cherries'],['דובדבן','דובדבנים']],
 ['coconut','1F965','Produce',['coconut','coconuts'],['קוקוס','אגוז קוקוס']],
 ['eggplant','1F346','Produce',['eggplant','eggplants','aubergine'],['חציל','חצילים']],
 ['corn','1F33D','Produce',['corn','corn on the cob','sweetcorn'],['תירס','תירסים','קלח תירס']],
 ['zucchini',B('cucumber'),'Produce',['zucchini','courgette','squash'],['קישוא','קישואים','דלעת','דלורית']],
 ['herbs','1F33F','Produce',['herbs','parsley','cilantro','coriander','dill','mint','basil','rosemary','thyme'],['פטרוזיליה','כוסברה','שמיר','נענע','בזיליקום','רוזמרין','טימין','עשבי תיבול','ירק']],
 ['ginger','1FADA','Produce',['ginger'],['ג\'ינג\'ר','גינגר','זנגביל']],
 ['peas','1FADB','Produce',['peas','green beans','snow peas'],['אפונה','שעועית ירוקה']],
 ['fruit',B('apple'),'Produce',['fruit','fruits','pomegranate','pomegranates','dates','figs','persimmon','papaya','lychee','guava','loquat'],['פירות','פרי','רימון','רימונים','תמר','תמרים','תאנה','תאנים','אפרסמון','אפרסמונים','פפאיה','ליצ\'י','גויאבה','שסק','שסקים']],
 ['vegetables','1F96C','Produce',['vegetables','veggies','veg','beet','beets','radish','radishes','fennel','artichoke','kohlrabi','tofu'],['ירקות','ירקות טריים','סלק','צנון','צנונית','צנוניות','שומר','ארטישוק','קולרבי','טופו','נבטים']],
 // Dairy
 ['milk',B('milk-carton'),'Dairy',['milk','soy milk','oat milk','almond milk','whole milk'],['חלב','חלב סויה','חלב שקדים','חלב שיבולת שועל','חלב 3%','חלב 1%','קרטון חלב','שקית חלב']],
 ['chocolate-milk',B('milk-carton'),'Dairy',['chocolate milk'],['שוקו','שוקו בשקית']],
 ['cream',B('milk-carton'),'Dairy',['cream','sour cream','whipping cream','heavy cream'],['שמנת','שמנת מתוקה','שמנת חמוצה','שמנת לבישול']],
 ['eggs',B('eggs'),'Dairy',['egg','eggs','dozen eggs'],['ביצה','ביצים','תבנית ביצים']],
 ['cheese',B('cheese'),'Dairy',['cheese','cottage cheese','cream cheese','mozzarella','parmesan','feta','cheddar','yellow cheese','white cheese','labneh'],['גבינה','גבינות','גבינה צהובה','גבינה לבנה','קוטג\'','קוטג','גבינת שמנת','מוצרלה','פרמזן','פטה','צפתית','בולגרית','צ\'דר','לבנה','גבינה מגורדת']],
 ['yogurt',B('yogurt'),'Dairy',['yogurt','yoghurt','yogurts','dairy dessert','kefir'],['יוגורט','יוגורטים','יופלה','מעדן','מעדנים','דני','מילקי','אשל','גיל','קפיר','לבן','ביו']],
 ['pudding','1F36E','Dairy',['pudding','custard','flan'],['פודינג','פודינגים','קרם וניל','פלאן','מלבי']],
 ['butter',B('butter'),'Dairy',['butter','margarine'],['חמאה','מרגרינה']],
 // Meat & fish
 ['chicken',B('chicken'),'Meat & fish',['chicken','chicken breast','chicken thighs','schnitzel','turkey','wings'],['עוף','עופות','חזה עוף','פרגית','פרגיות','שניצל','שניצלים','כרעיים','שוקיים','כנפיים','הודו','חזה הודו','עוף שלם']],
 ['beef',B('beef'),'Meat & fish',['beef','steak','steaks','meat','ground beef','minced meat','lamb','burger','burgers','hamburger'],['בשר','בשר טחון','סטייק','סטייקים','אנטריקוט','צלי','כבש','קציצות','המבורגר','המבורגרים','בשר בקר']],
 ['fish',B('fish'),'Meat & fish',['fish','salmon','fish fillet','tilapia','cod','sea bass'],['דג','דגים','סלמון','פילה דג','אמנון','מושט','דניס','לברק','בורי']],
 ['sausage','1F32D','Meat & fish',['sausage','sausages','hot dog','hot dogs','salami','deli meat','cold cuts'],['נקניק','נקניקים','נקניקיה','נקניקייה','נקניקיות','סלמי','פסטרמה']],
 ['shrimp','1F364','Meat & fish',['shrimp','prawns'],['שרימפס','חסילונים']],
 ['bacon','1F953','Meat & fish',['bacon'],['בייקון']],
 // Bakery
 ['bread',B('bread'),'Bakery',['bread','loaf','whole wheat bread','sliced bread','rolls','buns','bun','roll','toast'],['לחם','לחמים','לחם מלא','לחם אחיד','כיכר לחם','לחמניה','לחמנייה','לחמניות','טוסט','פרוסות']],
 ['challah',B('bread'),'Bakery',['challah'],['חלה','חלות']],
 ['pita',B('pita'),'Bakery',['pita','pitas','pita bread','wrap','wraps','tortilla','tortillas','laffa','matzah','matzo'],['פיתה','פיתות','לאפה','לאפות','טורטיה','טורטיות','מצה','מצות','טורטייה']],
 ['baguette','1F956','Bakery',['baguette','baguettes','french bread'],['באגט','באגטים','בגט']],
 ['croissant','1F950','Bakery',['croissant','croissants','pastry','pastries','bourekas','burekas'],['קרואסון','קרואסונים','בורקס','מאפה','מאפים','רוגלך']],
 ['bagel','1F96F','Bakery',['bagel','bagels'],['בייגל','בייגלים']],
 ['cake','1F370','Bakery',['cake','cakes'],['עוגה','עוגות','עוגת שמרים','עוגת שוקולד']],
 ['cupcakes','1F9C1','Bakery',['cupcake','cupcakes','muffin','muffins'],['קאפקייק','קאפקייקס','מאפין','מאפינס','מופין']],
 ['sandwich','1F96A','Bakery',['sandwich','sandwiches','toast sandwich'],['כריך','כריכים','סנדוויץ\'','סנדוויצים','טוסטים']],
 ['donut','1F369','Bakery',['donut','donuts','doughnut','doughnuts'],['סופגניה','סופגנייה','סופגניות','דונאט','דונאטס']],
 // Pantry
 ['rice',B('rice'),'Pantry',['rice','basmati','jasmine rice'],['אורז','אורז בסמטי','אורז פרסי','אורז מלא']],
 ['pasta',B('pasta'),'Pantry',['pasta','spaghetti','macaroni','noodles','penne','couscous','ptitim'],['פסטה','ספגטי','מקרוני','אטריות','פנה','פתיתים','קוסקוס','פסטות']],
 ['flour',B('flour'),'Pantry',['flour','baking powder','yeast','breadcrumbs'],['קמח','קמח לבן','קמח מלא','אבקת אפייה','שמרים','פירורי לחם','סודה לשתייה']],
 ['olive-oil',B('olive-oil'),'Pantry',['olive oil','oil','canola oil','vegetable oil','sunflower oil'],['שמן זית','שמן','שמן קנולה','שמן חמניות','שמן צמחי']],
 ['salt',B('salt'),'Pantry',['salt','spices','spice','black pepper','paprika','cumin','cinnamon','turmeric'],['מלח','תבלין','תבלינים','פלפל שחור','פפריקה','כמון','קינמון','כורכום','זעתר']],
 ['sugar',B('sugar'),'Pantry',['sugar','brown sugar','sweetener'],['סוכר','סוכר חום','ממתיק','סוכרזית']],
 ['honey',B('honey'),'Pantry',['honey','silan','date syrup','maple syrup'],['דבש','סילאן','סירופ מייפל']],
 ['coffee',B('coffee'),'Pantry',['coffee','instant coffee','espresso','coffee capsules','coffee beans'],['קפה','נס קפה','נסקפה','קפה שחור','קפסולות','קפסולות קפה','פולי קפה','קפה טורקי']],
 ['tea',B('tea'),'Pantry',['tea','tea bags','green tea','herbal tea'],['תה','שקיות תה','תה ירוק','חליטה','חליטות']],
 ['oats',B('oats'),'Pantry',['oats','oatmeal','rolled oats','porridge'],['שיבולת שועל','קוואקר','דייסה','דייסת שיבולת שועל']],
 ['cereal',B('cereal'),'Pantry',['cereal','cereals','cornflakes','granola','muesli'],['דגני בוקר','קורנפלקס','גרנולה','מוזלי','כריות']],
 ['beans',B('beans'),'Pantry',['beans','canned beans','white beans','kidney beans','black beans'],['שעועית','שעועית לבנה','שעועית אדומה','שעועית שחורה','שעועית בשימורים']],
 ['lentils',B('lentils'),'Pantry',['lentils','lentil','split peas'],['עדשים','עדשים כתומות','עדשים שחורות','אפונה יבשה']],
 ['chickpeas',B('chickpeas'),'Pantry',['chickpeas','chickpea','hummus','garbanzo'],['חומוס','גרגרי חומוס','חומוס מוכן','סלט חומוס']],
 ['jar','1FAD9','Pantry',['jam','tahini','ketchup','mayonnaise','mayo','mustard','sauce','pesto','spread','jar','salsa'],['ריבה','טחינה','קטשופ','מיונז','חרדל','רוטב','רטבים','פסטו','ממרח','ממרחים','צנצנת','סלסה','רוטב עגבניות','ממרח שוקולד','נוטלה']],
 ['peanut-butter','1F95C','Pantry',['peanut butter','almond butter'],['חמאת בוטנים','חמאת שקדים']],
 ['canned','1F96B','Pantry',['canned food','canned','cans','tomato paste','canned corn','canned tomatoes','tuna'],['שימורים','קופסת שימורים','רסק עגבניות','תירס בשימורים','עגבניות מרוסקות','טונה','טונות','קופסת טונה']],
 ['soup','1F372','Pantry',['soup','soup mix','broth','stock','bouillon'],['מרק','אבקת מרק','מרק עוף','ציר','קוביות מרק']],
 ['vinegar','1FAD7','Pantry',['vinegar','soy sauce','lemon juice','balsamic'],['חומץ','רוטב סויה','מיץ לימון','בלסמי','חומץ בלסמי']],
 ['pickles',B('cucumber'),'Pantry',['pickles','pickle','gherkins'],['חמוצים','מלפפונים חמוצים','מלפפון חמוץ','מלפפונים בחומץ']],
 ['olives','1FAD2','Pantry',['olives','olive'],['זיתים','זית','זיתים ירוקים','זיתים שחורים']],
 ['salad','1F957','Produce',['salad','ready salad','coleslaw','salad mix'],['סלט','סלטים','סלט ירקות','סלט כרוב','סלט מוכן']],
 ['noodles','1F35C','Pantry',['ramen','instant noodles','noodle soup','rice noodles'],['ראמן','נודלס','אטריות אורז','אטריות סיניות','מנה חמה']],
 ['tacos','1F32E','Pantry',['taco','tacos','taco shells','nachos'],['טאקו','נאצ\'וס','נאצוס']],
 ['sushi','1F363','Meat & fish',['sushi','nori','seaweed'],['סושי','אצות','אצות נורי']],
 // Frozen
 ['falafel','1F9C6','Frozen',['falafel','frozen falafel','veggie burger','schnitzel tiv'],['פלאפל','כדורי פלאפל','שניצל תירס','המבורגר צמחוני','שניצל צמחוני']],
 ['waffles','1F9C7','Frozen',['waffles','frozen waffles'],['וופלים בלגיים','וופל בלגי']],
 ['pancakes','1F95E','Pantry',['pancakes','pancake mix','crepes'],['פנקייק','פנקייקים','קרפ','קרפים','בלינצ\'ס','תערובת פנקייק']],
 ['ice-cream','1F368','Frozen',['ice cream','gelato','frozen yogurt'],['גלידה','גלידות','גלידת','ארטיק','ארטיקים','שלגון','שלגונים','קרטיב','קרטיבים']],
 ['frozen','1F9CA','Frozen',['frozen vegetables','frozen','ice','ice cubes','frozen peas'],['קפוא','קפואים','ירקות קפואים','קרח','קוביות קרח','שקית קרח']],
 ['pizza','1F355','Frozen',['pizza','frozen pizza'],['פיצה','פיצות','פיצה קפואה']],
 ['fries','1F35F','Frozen',['fries','french fries'],['צ\'יפס','ציפס','צ\'יפס קפוא']],
 ['dumplings','1F95F','Frozen',['dumplings','kreplach','ravioli','gyoza'],['כיסונים','קרפלך','רביולי','פלמני']],
 // Drinks
 ['water',B('water'),'Drinks',['water','mineral water','sparkling water','soda water','bottled water','water bottles'],['מים','מים מינרליים','מים מינרלים','בקבוק מים','בקבוקי מים','סודה','מי סודה','נביעות','שישיית מים']],
 ['juice',B('orange-juice'),'Drinks',['juice','orange juice','apple juice','grape juice','juice boxes','syrup'],['מיץ','מיצים','מיץ תפוזים','מיץ תפוחים','מיץ ענבים','פריגת','פטל לשתייה','מיץ פטל','תרכיז','סירופ','פרי גת','שתייה לילדים']],
 ['soda','1F964','Drinks',['soda','soft drink','soft drinks','cola','coke','sprite','lemonade','iced tea','drinks','energy drink'],['קולה','קוקה קולה','ספרייט','משקה','משקאות','שתייה','שתיה','לימונדה','תה קר','שתייה קלה','פאנטה','זירו','משקה אנרגיה']],
 ['beer','1F37A','Drinks',['beer','beers'],['בירה','בירות']],
 ['wine','1F377','Drinks',['wine','red wine','white wine','grape juice for kiddush'],['יין','יינות','יין אדום','יין לבן','יין לקידוש']],
 // Snacks
 ['chocolate',B('chocolate'),'Snacks',['chocolate','chocolates','chocolate bar','snack bar','snacks','snack','granola bar','cereal bar'],['שוקולד','שוקולדים','חטיף','חטיפים','חטיף שוקולד','חטיף אנרגיה','חטיפי דגנים','שוקולד מריר','קינדר','פסק זמן','קליק']],
 ['cookies','1F36A','Snacks',['cookie','cookies','biscuit','biscuits','wafers'],['עוגיה','עוגיות','ביסקוויט','ביסקוויטים','וופל','וופלים','פתי בר']],
 ['pretzel','1F968','Snacks',['pretzel','pretzels','bissli'],['בייגלה','בייגלך','ביסלי','מקלות מלוחים','בייגלה שטוח']],
 ['nuts','1F95C','Snacks',['nuts','peanuts','almonds','cashews','walnuts','pistachios','seeds','sunflower seeds','bamba','trail mix'],['אגוזים','אגוזי מלך','בוטנים','שקדים','קשיו','פיסטוק','גרעינים','במבה','פיצוחים','תערובת']],
 ['chips',B('potato'),'Snacks',['chips','crisps','potato chips','doritos','tortilla chips'],['תפוצ\'יפס','תפוציפס','צ\'יטוס','דוריטוס','חטיף תפוחי אדמה','תפוצ\'יפס בטעם']],
 ['candy','1F36C','Snacks',['candy','candies','sweets','gummies','gum','chewing gum','marshmallows'],['ממתק','ממתקים','סוכריה','סוכרייה','סוכריות','גומי','סוכריות גומי','מסטיק','מסטיקים','מרשמלו','ג\'לי']],
 ['lollipop','1F36D','Snacks',['lollipop','lollipops'],['סוכריה על מקל','סוכריות על מקל','לוליפופ','שלגון']],
 ['popcorn','1F37F','Snacks',['popcorn'],['פופקורן']],
 ['crackers','1F358','Snacks',['crackers','cracker','rice cakes','rice cake'],['קרקר','קרקרים','פריכיות','פריכית','מצות קמח מלא']],
 // Household
 ['toilet-paper',B('toilet-paper'),'Household',['toilet paper','paper towels','tissues','kitchen paper','napkins','kleenex','toilet rolls'],['נייר טואלט','מגבות נייר','נייר סופג','טישו','ממחטות','ממחטות נייר','מפיות','גלילי נייר','נייר מגבת']],
 ['dish-soap',B('dish-soap'),'Household',['dish soap','dishwashing liquid','dishwasher tablets','dishwasher pods','fairy','cleaner','cleaning spray','bleach','cleaning supplies','window cleaner','floor cleaner'],['סבון כלים','נוזל כלים','נוזל לכלים','טבליות למדיח','טבליות מדיח','פיירי','חומר ניקוי','חומרי ניקוי','אקונומיקה','ספריי ניקוי','מנקה','ווינדקס','סנו','נוזל רצפות','מסיר שומנים','מלח למדיח']],
 ['laundry-detergent',B('laundry-detergent'),'Household',['laundry detergent','detergent','washing powder','fabric softener','laundry gel','laundry pods'],['אבקת כביסה','ג\'ל כביסה','גל כביסה','חומר כביסה','מרכך כביסה','קפסולות כביסה','מסיר כתמים','סנו מקסימה']],
 ['sponge','1F9FD','Household',['sponge','sponges','scrubber','steel wool'],['ספוג','ספוגים','סקוטש','סקוטשים','ספוג כלים','צמר פלדה']],
 ['trash-bags','1F5D1','Household',['trash bags','garbage bags','bin bags','bin liners'],['שקיות זבל','שקיות אשפה','שקית זבל','שקיות לפח']],
 ['bags','1F6CD','Household',['bags','ziplock bags','sandwich bags','freezer bags','plastic bags'],['שקיות','שקיות סנדוויץ\'','שקיות הקפאה','שקיות ניילון','שקיות זיפלוק','שקיות אוכל']],
 ['foil',B('toilet-paper'),'Household',['aluminum foil','foil','baking paper','parchment paper','cling film','plastic wrap'],['נייר כסף','נייר אלומיניום','נייר אפייה','ניילון נצמד','ניילון נצמד למזון','תבניות אלומיניום']],
 ['disposable','1F374','Household',['disposable plates','paper plates','plastic cups','disposable cups','cutlery','plastic cutlery'],['כלים חד פעמיים','צלחות חד פעמיות','כוסות חד פעמיות','סכו"ם חד פעמי','חד פעמי','כוסות','צלחות','סכו"ם']],
 ['light-bulb','1F4A1','Household',['light bulb','light bulbs','bulb','bulbs'],['נורה','נורות','נורת לד','נורות לד']],
 ['batteries','1F50B','Household',['battery','batteries','aa batteries','aaa batteries'],['סוללה','סוללות','בטריות','בטריה']],
 ['lighter','1F525','Household',['lighter','matches','charcoal','firelighters'],['מצית','מציתים','גפרורים','גפרור','פחמים','מדליק']],
 ['candles','1F56F','Household',['candle','candles','shabbat candles','tealights'],['נר','נרות','נרות שבת','נרות נשמה','נרות חנוכה']],
 ['laundry-basket',A('laundry'),'Household',['clothes pegs','clothespins','laundry basket','hangers'],['אטבי כביסה','אטבים','סל כביסה','קולבים','קולב']],
 ['vacuum',A('vacuum'),'Household',['vacuum bags','vacuum filter'],['שקיות לשואב','פילטר לשואב','שואב אבק']],
 ['garden',A('watering-can'),'Household',['fertilizer','seeds for garden','garden hose'],['דשן','זרעים','צינור השקיה','זרעים לגינה']],
 ['flowers','1F490','Household',['flowers','bouquet'],['פרחים','זר פרחים','זר']],
 ['houseplant',A('houseplant'),'Household',['plant','houseplant','plants','potting soil'],['עציץ','עציצים','צמח','צמחים','אדמה לעציצים']],
 ['broom',A('broom'),'Household',['broom','dustpan'],['מטאטא','יעה']],
 ['mop',A('mop-bucket'),'Household',['mop','floor cloth','rag','bucket'],['מגב','סמרטוט','סמרטוטים','דלי','סחבה','סחבות']],
 // Personal care
 ['toothpaste',A('toothpaste'),'Personal care',['toothpaste','mouthwash'],['משחת שיניים','משחות שיניים','מי פה']],
 ['toothbrush',A('toothbrush'),'Personal care',['toothbrush','toothbrushes','dental floss','floss'],['מברשת שיניים','מברשות שיניים','חוט דנטלי']],
 ['soap',A('soap'),'Personal care',['soap','hand soap','liquid soap','hand wash'],['סבון','סבונים','סבון ידיים','סבון נוזלי','סבון רחצה']],
 ['shampoo','1F9F4','Personal care',['shampoo','conditioner','shower gel','body wash','deodorant','lotion','hand cream','sunscreen','moisturizer','body lotion'],['שמפו','מרכך','מרכך שיער','ג\'ל רחצה','סבון גוף','דאודורנט','קרם','קרם ידיים','קרם גוף','קרם הגנה','תחליב','קרם לחות']],
 ['razor','1FA92','Personal care',['razor','razors','shaving cream','blades'],['סכין גילוח','סכיני גילוח','תער','תערים','קצף גילוח','ג\'ילט']],
 ['bandages','1FA79','Personal care',['band-aids','band aids','bandages','plasters','first aid'],['פלסטר','פלסטרים','תחבושת','תחבושות','עזרה ראשונה']],
 ['medicine',A('medicine'),'Personal care',['medicine','medicines','vitamins','painkillers','paracetamol','ibuprofen','cough syrup','pharmacy'],['תרופה','תרופות','ויטמין','ויטמינים','אקמול','נורופן','אדויל','סירופ לשיעול','בית מרקחת','משככי כאבים']],
 ['thermometer',A('thermometer'),'Personal care',['thermometer'],['מדחום','מד חום']],
 ['mate','1F9C9','Drinks',['mate','yerba mate'],['מאטה','ירבה מאטה','מטה']],
 ['towel',A('hand-towel'),'Personal care',['towel','towels','cotton pads','cotton','q-tips','cotton swabs'],['מגבת','מגבות','צמר גפן','פדים','מקלוני אוזניים','מקלונים']],
 ['hairbrush',A('hairbrush'),'Personal care',['hairbrush','comb','hair ties','hair clips'],['מברשת שיער','מסרק','גומיות שיער','סיכות']],
 // Baby
 ['diapers','1F9F7','Baby',['diapers','diaper','nappies','pampers','huggies'],['חיתול','חיתולים','טיטולים','טיטול','האגיס','פמפרס','חיתולי בד']],
 ['baby-bottle','1F37C','Baby',['formula','baby formula','baby food','baby bottle','pacifier','puree'],['מטרנה','תמ"ל','תמל','סימילאק','אוכל לתינוק','מחית','מחיות','בקבוק לתינוק','מוצץ','מוצצים','דייסה לתינוק']],
 ['wipes',A('hand-towel'),'Baby',['wipes','wet wipes','baby wipes'],['מגבונים','מגבונים לחים','מגבוני תינוק','מגבון']],
 // Pets
 ['pet-food',A('pet-food'),'Pets',['pet food','dog food','cat food','kibble'],['אוכל לכלב','אוכל לכלבים','אוכל לחתול','אוכל לחתולים','מזון לכלבים','מזון לחתולים','אוכל לחיות','מזון לחיות','שימורים לחתול','שימורים לכלב']],
 ['pet-treats','1F9B4','Pets',['dog treats','pet treats','dog bone','chew toy'],['חטיפים לכלב','חטיף לכלב','עצם לכלב','חטיפים לחתול','חטיפים לחיות']],
 ['cat-litter','1F408','Pets',['cat litter','litter'],['חול לחתול','חול לחתולים','חול חתולים','ארגז חול']],
 ['leash',A('dog-leash'),'Pets',['leash','dog leash','collar'],['רצועה','רצועה לכלב','קולר']],
 // School and other
 ['notebook',A('notebook'),'Other',['notebook','notebooks','exercise book','paper','printer paper'],['מחברת','מחברות','דפים','נייר מדפסת','בלוק','בלוק ציור']],
 ['pencils',A('pencils'),'Other',['pencil','pencils','crayons','markers','colored pencils'],['עיפרון','עפרון','עפרונות','צבעים','טושים','טוש','צבעי עיפרון','מחק','מחדד']],
 ['pens','1F58A','Other',['pen','pens','highlighter'],['עט','עטים','מרקר','מדגש','מדגשים']],
 ['backpack',A('backpack'),'Other',['backpack','school bag','schoolbag'],['תיק','ילקוט','תיק לבית ספר','תיק גב']],
 ['lunchbox',A('lunchbox'),'Other',['lunchbox','lunch box','food container','containers'],['קופסת אוכל','קופסאות אוכל','קופסת אוכל לילדים','קופסאות','קופסה']],
 ['scissors',A('scissors'),'Other',['scissors','glue','tape','craft supplies'],['מספריים','דבק','דבק סטיק','סלוטייפ','נייר דבק','חומרי יצירה']],
 ['gift',A('gift'),'Other',['gift','gifts','present','presents','gift wrap'],['מתנה','מתנות','נייר עטיפה','שובר מתנה']],
 ['birthday-cake',A('birthday-cake'),'Bakery',['birthday cake'],['עוגת יום הולדת','עוגת יומולדת']],
 ['sneakers',A('sneakers'),'Other',['shoes','sneakers','socks'],['נעליים','נעלי ספורט','גרביים','גרבים']],
 ['shirt',A('folded-shirt'),'Other',['shirt','shirts','t-shirt','clothes','underwear','pajamas'],['חולצה','חולצות','בגדים','תחתונים','פיג\'מה','פיג\'מות','בגד']],
];

const NIQQUD=/[֑-ׇ]/g,FINALS={'ך':'כ','ם':'מ','ן':'נ','ף':'פ','ץ':'צ'},HEB=/[א-ת]/;
// Lower-cased, niqqud-free, punctuation-free words; geresh/gershayim/apostrophes are dropped (קוטג' → קוטג).
export function words(text){return String(text??'').normalize('NFKC').toLocaleLowerCase().replace(NIQQUD,'').replace(/["'`׳״’‘”“]/g,'').replace(/[^\p{L}\p{N}%]+/gu,' ').trim().split(' ').filter(Boolean)}
// One canonical stem per word, applied to both the dictionary and the input: final letters, double vav/yod
// spellings and plural/feminine endings for Hebrew; plural endings for English.
export function stem(word){
 if(HEB.test(word)){let w=word.replace(/[ךםןףץ]/g,c=>FINALS[c]).replace(/יי/g,'י').replace(/וו/g,'ו');if(w.length>=5&&/(ימ|ות)$/.test(w))w=w.slice(0,-2);else if(w.length>=4&&/ה$/.test(w))w=w.slice(0,-1);return w}
 if(word.length>4&&word.endsWith('ies'))return word.slice(0,-3)+'y';
 if(word.length>4&&/(oes|ches|shes|xes|sses)$/.test(word))return word.slice(0,-2);
 if(word.length>3&&word.endsWith('s')&&!/(ss|us)$/.test(word))return word.slice(0,-1);
 return word;
}
// Spellings to try for one typed word: as typed, and without a leading ה/ו (העגבניות, וחלב).
const finals=w=>w.replace(/[ךםןףץ]/g,c=>FINALS[c]);
const variants=(word,f=stem)=>{const out=[f(word)];if(HEB.test(word)&&word.length>=4&&/^[הו]/.test(word))out.push(f(word.slice(1)));if(HEB.test(word)&&word.length>=5&&/^(וה)/.test(word))out.push(f(word.slice(2)));return [...new Set(out)]};
const keyOf=list=>list.map(stem).join(' ');

const INDEX=new Map(),EXACT=new Map(),BY_KEY=new Map();let LONGEST=1;
for(const [key,icon,group,en,he] of ITEMS){const entry={key,icon,group,en,he};BY_KEY.set(key,entry);for(const name of [...en,...he]){const w=words(name);if(!w.length)continue;LONGEST=Math.max(LONGEST,w.length);const k=keyOf(w),exact=w.map(finals).join(' ');if(!INDEX.has(k))INDEX.set(k,entry);if(!EXACT.has(exact))EXACT.set(exact,entry)}}

function combos(list,f=stem){let out=[[]];for(const w of list){const next=[];for(const prefix of out)for(const v of variants(w,f))next.push([...prefix,v]);out=next}return out}
// Exact spelling first (בייגלה is a pretzel even though its stem equals בייגל), then the shared stem.
const lookup=list=>{for(const c of combos(list,finals)){const hit=EXACT.get(c.join(' '));if(hit)return hit}for(const c of combos(list)){const hit=INDEX.get(c.join(' '));if(hit)return hit}return null};

// Best dictionary entry for free text. Longer phrases win ("מלפפונים חמוצים" → pickles, not cucumber). Between
// equal-length matches Hebrew prefers the first word (שוקולד חלב → chocolate) and English the last (almond milk → milk).
export function findItem(text){
 const w=words(text);if(!w.length)return null;const hebrew=HEB.test(w.join(''));let best=null;
 for(let n=Math.min(LONGEST,w.length);n>=1&&!best;n--){const hits=[];for(let i=0;i+n<=w.length;i++){const hit=lookup(w.slice(i,i+n));if(hit)hits.push({hit,i})}if(hits.length)best=(hebrew?hits[0]:hits.at(-1)).hit}
 if(best)return best;
 // Prefix fallback for longer or inflected words (מלפפוניםם, חלבי…): a known word of at least 3 letters that starts the typed word.
 for(const word of hebrew?w:[...w].reverse())for(const v of variants(word)){if(v.length<3)continue;let found=null;for(const [k,entry] of INDEX){if(k.includes(' ')||k.length<3)continue;if(v.startsWith(k)&&v.length-k.length<=3&&(!found||k.length>found.k.length))found={k,entry}}if(found)return found.entry}
 return null;
}
export function matchItem(text){const e=findItem(text);return e?{icon:e.icon,group:e.group,key:e.key}:{...FALLBACK_ITEM}}
export const categoryFor=text=>matchItem(text).group;

// Icon picker search: dictionary entries whose Hebrew or English names contain the query (or match it as a word).
// Returns [{icon,en,he,group,key}] without duplicate icons, best matches first.
export function iconSearch(query,limit=40){
 const q=words(query).join(' ');if(!q)return [];const exact=findItem(query),qs=words(query).map(stem).join(' '),seen=new Set(),out=[];
 const push=e=>{if(!e||seen.has(e.icon)||out.length>=limit)return;seen.add(e.icon);out.push({icon:e.icon,group:e.group,key:e.key,en:e.en[0],he:e.he[0]})};
 push(exact);
 for(const e of BY_KEY.values())if([...e.en,...e.he].some(n=>{const w=words(n),joined=w.join(' ');return joined.includes(q)||keyOf(w).includes(qs)}))push(e);
 return out;
}
export const iconIdsFor=query=>new Set(iconSearch(query,200).map(r=>r.icon));
export const dictionarySize=()=>({entries:ITEMS.length,names:ITEMS.reduce((n,i)=>n+i[3].length+i[4].length,0)});
