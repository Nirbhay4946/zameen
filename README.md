# Zameen Register 🌾 — land parcel records on your phone

Offline web app (PWA) for keeping complete records of scattered land parcels.
**All data stays on your phone** (browser IndexedDB). Nothing is uploaded anywhere.

## What it keeps per parcel
- **Location & revenue record** — state, district, anchal, halka, mauza, thana no., khata, khesra, survey (CS/RS/BSS), ULPIN, jamabandi, bhag-pristha, land type/class, CS/RS raiyat
- **Area** — record area in Bigha-Kattha-Dhur / Acre-Decimal (kattha size settable per parcel), compared against **GPS area** and **tape/chain (Heron) area**, with % difference
- **Boundary** — corners recorded with phone GPS (averaged per corner, re-measure & merge sessions), drag onto satellite image, insert corners, per-side lengths and which direction each side faces
- **Chauhaddi** — N/E/S/W *as per deed* vs *on ground today*, mismatch flag, auto-drawn sketch (naksha) with side lengths and neighbours
- **Ownership** — current owners & shares, full chain of title (kewala, inheritance, partition, gift, settlement…) with deed no., registry office, vol/page, ₹, mutation case
- **Documents** — photos/PDFs of kewala, khatiyan, jamabandi, lagan rasid, LPC, mutation order, naksha… (auto-compressed), checklist of what's missing
- **Lagan / LPC / mutation status**, lease/bataidari, mortgage, to-do reminders, notes

## Field tools
- **Record boundary**: stand on each corner, tap *Record corner*, hold still 20 s. Accuracy shown green ≤5 m / amber ≤12 m / red.
- **Walk boundary** (〰️): walk the whole loop along the ail/edge. Every point is kept raw (one per metre moved), with no straightening or smoothing. If you stop short of the start it warns you about the gap. Each walked loop is saved in **Walks & history**, so walk it twice and compare the areas.
- **Kattha calibrator**: enter an area your deed gives in both decimal and bigha-kattha, and it works out the local kattha size (default for new parcels: East Champaran, 1361.25 sq ft).
- **Find / check**: walk to a saved corner (distance + compass arrow), and see whether you are *inside or outside* the plot and how far from which side — useful for spotting encroachment.
- **Import**: KML/KMZ/GPX/GeoJSON (e.g. traced in Google Earth or from an amin), or paste lat,lng lines.

## Outputs
- Printable record / PDF per parcel
- **Full backup ZIP** → share to Telegram/Drive. Contains data.json + every document, `parcels.kml` (Google Earth), `parcels.geojson`, `parcels.csv` (Excel), and an `obsidian/` folder of notes with attachments (frontmatter has `location:` for Obsidian Map View).
- **Auto-backup to Telegram** via your own bot. It sends a small data-only ZIP after changes, and a full ZIP whenever documents changed. Files over 45 MB are split into .001/.002 parts, which you restore by selecting all parts together.
- Restore (merge or replace) from that ZIP on any phone.
- **📖 Glossary** of land terms (khata, khesra, jamabandi, dakhil-kharij, LPC, kistwar, khanapuri, land types, units…) with search.

## Install (one time, from your Ubuntu laptop)
Phones only allow GPS on **https** sites, so host it free on GitHub Pages:
```bash
unzip zameen-register.zip && cd zameen
./deploy.sh            # needs: sudo apt install git gh   (logs you into GitHub once)
```
It prints your URL (`https://<you>.github.io/zameen/`). Open it in Chrome on the phone → ⋮ → **Add to Home screen**. It then works offline in the field (satellite imagery needs internet).

No GitHub? Any static HTTPS host works (Netlify, Cloudflare Pages) — just upload the folder.
Test on the laptop: `python3 -m http.server 8000` → http://localhost:8000

Updating later: edit files, bump `V` in `sw.js`, run `./deploy.sh` again.

## Accuracy, honestly
Phone GPS is typically a few metres off; dual-frequency phones do better. Averaging, re-measuring at another time of day, nudging corners onto visible ails/bunds on the satellite image, and the tape cross-check all reduce the error. This is a strong personal record — not a legal survey. For disputes, get an amin measurement against the Bhu-Naksha.

## Data safety
- Take a backup after every field visit (the home screen nags after 30 days).
- Don't "Clear site data" for this site. The app requests persistent storage.
