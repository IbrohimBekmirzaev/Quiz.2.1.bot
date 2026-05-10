# Qalb Ul Arabiyya Quiz

Node.js asosida yozilgan Telegram quiz bot va Telegram Mini App. Bot arabcha so‘zlarni test qiladi, Mini App esa testlar, reyting, profil, daily challenge va admin analytics uchun ishlatiladi.

## Asosiy Imkoniyatlar
- Telegram bot ichida quiz testlar.
- Telegram Mini App: testlar, reyting, profil, weak words, xato so‘zlarni qayta yechish.
- Admin inline panel: `/admin`.
- Support inbox: foydalanuvchi yuborgan matn, rasm, video, voice, document, sticker va boshqa xabarlar admin topicga boradi.
- Admin reply: support logga reply qilsangiz foydalanuvchiga javob ketadi.
- Broadcast: matn yoki media xabarni barcha foydalanuvchilarga yuborish.
- Ikki log guruhga yuborish: primary va secondary log group.
- Railway uchun `/health` endpoint va Mini App static hosting.

## Ishga Tushirish
1. `npm install`
2. `.env.example` faylidan `.env` yarating.
3. `.env` ichidagi qiymatlarni to‘ldiring.
4. `npm start`

Development uchun:

```bash
npm run dev
```

Test uchun:

```bash
npm test
```

## Muhim Env Sozlamalari
`.env` ichida hozirgi loyiha uchun asosiy qiymatlar:

```env
ADMIN_USER_IDS=7610350762,6899432112
MINI_APP_URL=https://quiz21bot-production.up.railway.app/mini-app
RAILWAY_PUBLIC_DOMAIN=quiz21bot-production.up.railway.app
BOOKS_API_URL=https://bs.asmoarabic.com/api/getbooks
API_URL=https://bs.asmoarabic.com/api/getAllLessonVocabularies
QUESTIONS_PER_TEST=10
TESTS_PER_PAGE=6
BOT_NAME=Qalb Ul Arabiyya Quiz
```

`BOT_TOKEN` maxfiy. Uni GitHubga yuklamang. `.env` fayli `.gitignore` ichida turishi shart.

## Admin Huquqlar
To‘liq admin huquq berilgan user ID’lar:

- `7610350762`
- `6899432112`

Bu ID’lar botda admin komandalarni ishlata oladi va Mini App ichida admin dashboard ko‘radi.

## Bot Komandalari
- `/start` - botni boshlash.
- `/quiz` - quiz test menyusi.
- `/app` - Mini Appni ochish.
- `/profile` - foydalanuvchi profili.
- `/top` - Top 10 reyting.
- `/help` - yordam.
- `/admin` - admin inline panel.

## Admin Komandalari
- `/admin` - inline admin panelni ochadi.
- `/adminstats` - umumiy statistika va analytics.
- `/pending` - javob kutilayotgan support xabarlar.
- `/user ID` - bitta foydalanuvchi haqida ma’lumot.
- `/broadcast matn` - barcha userlarga matn yuborish.
- `/confirmbroadcast` - broadcastni tasdiqlash.
- `/cancelbroadcast` - broadcastni bekor qilish.

Media broadcast uchun rasm, video, voice, audio yoki document yuboring va caption boshiga `/broadcast` yozing.

## Log Topiclar
Primary log group:

- `TOPIC_START_ID` - start va umumiy ishga tushish loglari.
- `TOPIC_QUIZ_ID` - quiz boshlandi/yakunlandi loglari.
- `TOPIC_LINK_ID` - Mini App va link hodisalari.
- `TOPIC_SUPPORT_ID` - foydalanuvchi xabarlari va support.
- `TOPIC_ERROR_ID` - xatoliklar.
- `TOPIC_USERS_ID` - yangi foydalanuvchi statistikasi.

Secondary log group uchun:

- `SECOND_LOG_GROUP_ID`
- `SECOND_TOPIC_START_ID`
- `SECOND_TOPIC_QUIZ_ID`
- `SECOND_TOPIC_LINK_ID`
- `SECOND_TOPIC_SUPPORT_ID`
- `SECOND_TOPIC_ERROR_ID`
- `SECOND_TOPIC_USERS_ID`

## Mini App
Mini App manzili:

```text
https://quiz21bot-production.up.railway.app/mini-app
```

Mini App ichida:

- Testlar bot bilan bir xil bazadan olinadi.
- Rating va profil bor.
- Daily challenge bor.
- Weak words va xato so‘zlarni qayta yechish bor.
- Admin userlarda admin analytics ko‘rinadi.

Telegram BotFather’da Menu Button yoki `/app` tugmasi shu URLga ulanishi kerak.

## Railway
Railway’da Variables ichiga `.env` qiymatlarini kiriting. Ayniqsa:

- `BOT_TOKEN`
- `ADMIN_GROUP_ID`
- `ADMIN_USER_IDS`
- `MINI_APP_URL`
- `RAILWAY_PUBLIC_DOMAIN`
- topic ID’lar
- API URL’lar

Deploydan keyin tekshirish:

```text
https://quiz21bot-production.up.railway.app/health
```

Bot faqat bitta joyda ishlasin. Railway ishlab turganda lokal kompyuterda `npm start` qilsangiz `409 Conflict` chiqishi mumkin.

## Xavfsizlik
- `.env` faylini GitHubga yuklamang.
- Token ochilib qolsa, BotFather orqali darhol yangi token oling.
- Broadcast faqat admin ID’lar uchun ishlaydi.
- Admin panel callbacklari ham faqat admin ID’larda ishlaydi.
