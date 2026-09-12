# DualLaunch live zetten op Vercel

Je hebt geen code-kennis nodig voor optie A.

## Optie A — Vercel dashboard (aanrader)

1. Maak een gratis account op https://vercel.com  
   Log in met GitHub, GitLab of e-mail.

2. Zet deze map in GitHub
   - Ga naar https://github.com/new
   - Repository-naam: `duallaunch`
   - Public
   - Maak de repo aan
   - Upload deze bestanden: `index.html`, `logo.jpg`, `vercel.json`, `package.json`

   Of op je computer (als Git geïnstalleerd is):

   ```bash
   cd duallaunch
   git init
   git add index.html logo.jpg vercel.json package.json
   git commit -m "DualLaunch demo"
   git branch -M main
   git remote add origin https://github.com/JOUW-USER/duallaunch.git
   git push -u origin main
   ```

3. Importeer in Vercel
   - https://vercel.com/new
   - **Import** de `duallaunch` repo
   - Framework preset: **Other**
   - Root directory: `.` (standaard)
   - Build command: leeg laten
   - Output directory: leeg laten
   - **Deploy**

4. Klaar  
   Je krijgt een link zoals `https://duallaunch-xxx.vercel.app`.  
   Onder **Settings → Domains** kun je later `duallaunch.nl` koppelen.

## Optie B — zonder GitHub (Vercel CLI)

Op je computer, in deze map:

```bash
npm install -g vercel
vercel login
vercel
```

Antwoorden:

- Set up and deploy? **Y**
- Link to existing? **N**
- Project name: `duallaunch`
- Directory: `.`
- Want to modify settings? **N**

Daarna productie:

```bash
vercel --prod
```

## Optie C — drag-and-drop

1. Open https://vercel.com/new
2. Als je de optie **Upload** ziet: sleep de map `duallaunch` erin
3. Deploy

(Niet in elk account zichtbaar; A of B werkt altijd.)

## Na live

- Open de `.vercel.app` URL
- Test Board, een munt, Launch
- Deel de link
- Optioneel: dezelfde URL in een iframe op JouwWeb zetten

Dit is nog de demo. Wallets en echte PONS/pump.fun-transacties komen in een volgende versie.
