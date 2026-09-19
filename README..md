# DualLaunch

Prototype-website + bouwplan voor een meme-coin launcher op **Robinhood Chain** (EVM L2, chain ID 4663) en **Solana**.

Dit is geen live launchpad. De UI laat het product zien. On-chain launches vereisen contracts, RPCs, wallet-integratie en juridische afstemming.

## Wat er al is

- `index.html` — landing + launch-formulier (demo)
- `logo.jpg` — merkmark
- dit document — architectuur en stappenplan

Open `index.html` in een browser.

## Productkeuze (belangrijk)

Er zijn drie realistische routes:

1. **Aggregator (snelst)**  
   Jouw site is de UX. De echte launch gaat via bestaande factories:
   - Robinhood Chain: PONS / Uniswap pools.trade
   - Solana: pump.fun of een open launchlab
   Voordeel: weken i.p.v. maanden. Nadeel: je bent afhankelijk van hun ABI/fees.

2. **Eigen factory (meest “eigen product”)**  
   Zelf ERC-20 factory + locked Uniswap V3 pool op RH Chain, en een Solana-programma of Token-2022 + Meteora/Raydium pool.  
   Dit is een serieus protocol, niet alleen een website.

3. **Hybride MVP**  
   Week 1–2: UI + wallet connect + metadata upload (IPFS).  
   Week 3–4: RH Chain testnet ERC-20 deploy.  
   Daarna Solana SPL mint. Liquidity later.

Voor een eerste versie is route 3 het verstandigst.

## Tech stack voorstel

Frontend:

- Next.js (App Router) + TypeScript
- RH Chain: `wagmi` + `viem` + RainbowKit/ConnectKit
- Solana: `@solana/wallet-adapter-react` + `@solana/web3.js` + `@solana/spl-token`
- Metadata: Pinata of NFT.Storage (IPFS)
- Hosting: Vercel

RH Chain netwerk:

| Veld | Waarde |
| --- | --- |
| Chain ID | 4663 |
| Testnet | 46630 |
| Gas | ETH |
| Public RPC | https://rpc.mainnet.chain.robinhood.com |
| Explorer | https://robinhoodchain.blockscout.com |
| Docs | https://docs.robinhood.com/chain/connecting |

Productie-RPC via Alchemy/QuickNode, niet de publieke node.

Solana:

- RPC: Helius / Triton / QuickNode (publieke RPC is te traag)
- Token: SPL of Token-2022
- Metadata: Metaplex Token Metadata
- Liquiditeit: apart productbesluit (curve vs directe AMM)

## MVP scope (4 weken)

Week 1  
- Deze UI omzetten naar Next.js  
- Wallet connect per chain  
- Form validatie, image upload naar IPFS  

Week 2  
- Minimal ERC-20 (vaste supply, 18 decimals) + Foundry deploy op RH testnet  
- “Launch” knop stuurt `forge`/viem `deploy` vanuit de browser via wallet  

Week 3  
- Solana: create mint + metadata + mint supply naar creator  
- Token-pagina met contractadres / mint + explorer-links  

Week 4  
- Eerste liquiditeit: RH Uniswap V3 testnet óf alleen “token created, add LP later”  
- Disclaimers, rate limits, basis-moderatie (geen impersonatie van HOOD/CASHCAT etc.)

Wat je níet in MVP stopt: bonding curves, sniper-protectie, bundle-bots, cross-chain bridges, fee-sharing vaults.

## Juridisch & risico (niet overslaan)

- Meme coins kunnen in de EU onder **MiCA** of effectenrecht vallen, afhankelijk van marketing en beloftes.
- Zeg nooit “investering”, “winstgarantie” of “Robinhood official”.
- Geen mint-rechten, geen verborgen owner, LP lock zichtbaar on-chain.
- Toon harde disclaimers. Overweeg geo-restricties (VS is extra gevoelig).
- Laat een crypto-jurist meekijken vóór mainnet.

## Wat ik als volgende kan bouwen

Zeg wat je wilt, dan ga ik verder:

1. Next.js project met dual wallet-connect (nog demo-tx)
2. Foundry ERC-20 + factory skeleton voor RH testnet
3. Solana create-token script (CLI + web hook)
4. Volledige merk/UI polish + token-pagina

Stuur ook: budget, of je zelf contracts wilt of bestaande pads wilt wrappen, en of de site NL-only of internationaal moet zijn.
