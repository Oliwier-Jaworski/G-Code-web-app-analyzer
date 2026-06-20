# G-code Analyzer

Webowa aplikacja do analizy plików `.gcode` z drukarek 3D FDM
(Marlin/RepRap, slicery typu Cura/PrusaSlicer).

- **Backend**: FastAPI + Uvicorn (Python).
- **Frontend**: czysty HTML + Vanilla JS + Tailwind CSS przez CDN.
- Frontend jest serwowany przez FastAPI (`StaticFiles`), więc całość działa
  pod jednym procesem — bez problemów z CORS i bez osobnego serwera.

## Struktura

```
.
├── backend/
│   ├── main.py            # aplikacja FastAPI + endpoint /api/analyze
│   ├── parser.py          # stanowy parser G-code
│   └── requirements.txt
├── frontend/
│   ├── index.html         # formularz upload + kafelki metryk
│   └── app.js             # fetch (XHR) + render wyników
└── README.md
```

## Uruchomienie

Wymagany Python 3.9+.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate         # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Następnie otwórz [http://localhost:8000/](http://localhost:8000/).

Automatyczna dokumentacja FastAPI dostępna pod
[http://localhost:8000/docs](http://localhost:8000/docs).

## API

### `POST /api/analyze`

- **Body**: `multipart/form-data` z polem `file` (rozszerzenia: `.gcode`,
  `.gco`, `.g`; limit 200 MB).
- **Kody błędów**: `400` (nieobsługiwane rozszerzenie / pusty plik),
  `413` (przekroczony limit rozmiaru), `422` (błąd parsowania).
- **Odpowiedź** (JSON):

| Pole | Opis |
| --- | --- |
| `filename` | Nazwa wgranego pliku |
| `fileSizeBytes` | Rozmiar pliku w bajtach |
| `lineCount` | Liczba linii w pliku |
| `bounds` | `{x:[min,max], y:[...], z:[...]}` w mm |
| `size` | `{x,y,z}` — wymiary bounding boxa w mm |
| `travelDistanceMm` | Suma ruchów bez ekstruzji (przejazdy) |
| `printDistanceMm` | Suma ruchów z dodatnim `dE` (druk) |
| `totalDistanceMm` | Suma `travel + print` |
| `filamentMm` / `filamentM` | Zużycie filamentu w mm i m |
| `estimatedTimeS` | Szacowany czas druku w sekundach (bez akceleracji) |
| `layerCount` | Liczba warstw |
| `layerHeightMm` | Mediana odstępu między warstwami (może być `null`) |

### `GET /api/health`

Zwraca `{"status":"ok"}`.

## Parser — co robi, czego nie

- **Robi**: tryb absolutny/relatywny dla XYZ (`G90`/`G91`), tryb ekstrudera
  (`M82`/`M83`), reset osi (`G92`), modalne ruchy `G0`/`G1` (oraz `G2`/`G3`
  uproszczone do linii prostej do punktu końcowego), preferowane liczenie
  warstw z komentarzy slicera (`;LAYER:` / `;LAYER_COUNT:`) z fallbackiem do
  unikalnych Z, na których była ekstruzja.
- **Nie robi**: modelu akceleracji (czas to suma `dist / (F/60)`), pełnej
  geometrii łuków `G2`/`G3`, jednostek calowych (`G20`). W razie potrzeby
  łatwo dopisać.

## Ograniczenia

- Limit pliku: 200 MB (`MAX_BYTES` w [`backend/main.py`](backend/main.py)).
- Cały plik trafia do pamięci RAM (strumieniowane chunkami, ale agregowane
  przed parsowaniem).
