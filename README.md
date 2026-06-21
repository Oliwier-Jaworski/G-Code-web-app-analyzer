# G-code Analyzer

Prosta aplikacja webowa, która czyta plik `.gcode` z drukarki 3D i mówi Ci, co w nim siedzi: ile waży wydruk, jak długo potrwa, jakie ma wymiary — i pokazuje podgląd 3D ścieżki głowicy.

Działa lokalnie w przeglądarce. Wgrywasz plik, dostajesz wyniki. Bez konta, bez chmury.

## Co potrafi

### Metryki wydruku

Po wgraniu pliku zobaczysz kafelki z:

- **Szacowany czas druku** — liczony z prędkości zapisanych w gcode (F), z uwzględnieniem akceleracji. To orientacyjna wartość, nie gwarancja co do sekundy.
- **Zużycie filamentu w gramach** — przeliczane z długości ekstruzji, średnicy i gęstości materiału.
- **Liczba warstw i wysokość warstwy**
- **Rozmiar wydruku** (X × Y × Z) — tylko z ruchów z ekstruzją, bez homingu i probowania stołu
- **Łączna droga głowicy** — podział na druk vs. przejazdy (travel)

### Parametry do przeliczenia (bez ponownego uploadu)

Panel **Parametry** pozwala zmienić założenia i od razu zobaczyć nowe liczby:

- **Materiał** — PLA, PETG, ABS, ASA, TPU, Nylon, PC (każdy ma inną gęstość)
- **Średnica filamentu** — 1.75 mm lub 2.85 mm
- **Mnożnik prędkości** — np. 80% oznacza „drukuj wolniej niż w pliku" → czas rośnie o ~25%

Pod sliderem prędkości widać też **bazową prędkość druku z gcode** (np. „52,3 mm/s") — to średnia ważona z pliku, nie jedna liczba z ustawień slicera.

### Porównanie ze slicerem

Jeśli plik ma w nagłówku komentarze slicera (Cura, PrusaSlicer, OrcaSlicer), aplikacja je odczyta i pokaże obok naszych wyników:

- czas deklarowany przez slicer vs. nasz szacunek
- długość filamentu, masa, wysokość warstwy

Przydatne, żeby sprawdzić, czy parser liczy sensownie.

### Podgląd 3D toolpathu

Po analizie pojawia się interaktywny viewer (Three.js). Możesz obracać model myszką, przybliżać i przełączać tryby:

| Tryb | Co widać |
| --- | --- |
| **Wszystko** | Ekstruzja (niebieska) + przejazdy głowicy (szare, półprzezroczyste) |
| **Tylko ekstruzja** | Same linie druku — najczytelniejszy do sprawdzenia ścieżek |
| **Po warstwach** | Gradient koloru od dołu do góry (każda warstwa inny odcień) |
| **Bryła** | Jak mógłby wyglądać gotowy wydruk — grube „nici" filamentu w jednolitym jasnym kolorze, z lekką mgłą w tle i ciemnymi konturami w zagłębieniach, żeby lepiej widać kształt (kominek, łuk dziobu, cienkie ścianki) |

Tryb **Bryła** nie jest fotorealistycznym renderem — to przybliżenie: każdy segment ekstruzji rysowany jak gruby pręt o szerokości ~0.4 mm (typowa dysza). Gęste miejsca (wiele linii obok siebie) naturalnie ciemnieją dzięki nakładającym się konturom.

Duże pliki są próbkowane (domyślnie do ~80 tys. segmentów), żeby viewer nie zamulał przeglądarki.

## Uruchomienie

Potrzebujesz Pythona 3.9+.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

Wejdź na [http://localhost:8000/](http://localhost:8000/) i wrzuć plik `.gcode`.

Dokumentacja API (Swagger): [http://localhost:8000/docs](http://localhost:8000/docs)

### Testy (opcjonalnie)

```bash
pip install -r requirements-dev.txt
python -m pytest tests
```

## Jak to działa pod spodem

- **Backend**: FastAPI — jeden endpoint `POST /api/analyze`, opcjonalnie `?toolpath=1` żeby dostać dane do viewera 3D.
- **Frontend**: czysty HTML + Vanilla JS + Tailwind (CDN) + Three.js (CDN). Serwowany przez ten sam FastAPI — bez osobnego serwera frontu i bez CORS.
- **Parser**: jeden przebieg przez plik, pamięta stan G-code (G90/G91, M82/M83, G92, łuki G2/G3, akceleracja przy liczeniu czasu). Filament liczony przez „high-water mark" E — retract/unretract w trybie absolutnym (S3D) nie zawyża zużycia.

## Struktura projektu

```
.
├── backend/
│   ├── main.py              # FastAPI, upload, serwowanie frontendu
│   ├── parser.py            # parser G-code + metryki + toolpath
│   ├── requirements.txt
│   ├── requirements-dev.txt # pytest
│   └── tests/
│       └── test_parser.py
├── frontend/
│   ├── index.html           # UI: upload, parametry, kafelki, viewer
│   ├── app.js               # logika strony, upload, przeliczanie masy/czasu
│   └── viewer.js            # Three.js: toolpath + tryb Bryła
└── README.md
```

## API w skrócie

**`POST /api/analyze`** — wgrywasz plik (`.gcode`, `.gco`, `.g`), dostajesz JSON.

Query: `?toolpath=1` — dołącza dane do podglądu 3D (`toolpath.extrusion`, `toolpath.travel`).

Limit rozmiaru: 200 MB.

**`GET /api/health`** — `{"status":"ok"}`

Pełna lista pól w odpowiedzi (najważniejsze):

| Pole | Znaczenie |
| --- | --- |
| `bounds`, `size` | Wymiary modelu (mm), tylko z ekstruzji |
| `motionBounds` | Pełny zakres ruchu głowicy (z homingiem itd.) |
| `filamentMm` | Długość wyciśniętego filamentu |
| `estimatedTimeS` | Czas z akceleracją (domyślnie a=1500 mm/s²) |
| `avgPrintSpeedMmS` | Średnia prędkość druku z pliku |
| `layerCount`, `layerHeightMm` | Warstwy |
| `slicer` | Metadane z nagłówka pliku (jeśli są) |
| `toolpath` | Segmenty do viewera (gdy `?toolpath=1`) |

## Ograniczenia (uczciwie)

- Czas druku to szacunek — prawdziwa drukarka ma jerk, junction deviation, pauzy na heatbed itd.
- Bryła w viewerze to wizualizacja ścieżek, nie mesh STL — nie zastąpi podglądu w slicerze.
- Plik wczytywany jest do RAM (do 200 MB).
- Jednostki calowe (`G20`) nie są obsługiwane.
