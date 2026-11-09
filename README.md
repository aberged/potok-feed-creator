# potok-feed-creator

Potok aplikacija za pisanje i uređivanje objava u feed-u. Stoji u opisu grupe `.feed`, a svaka objava je jedna podgrupa te grupe. Autor bira format, piše tekst i na dugme **Sačuvaj** ili **Objavi** dobija grupu čiji opis [Feed](https://github.com/aberged/potok-feed) prikazuje u roditeljskoj grupi.

Napravljena je po šablonu [potok-vite](https://github.com/aberged/potok-vite/tree/align-alt-descriptions). Aplikacija je jedan fajl, `dist/potok-build.html`, koji se nalepi kao opis grupe sa uključenim „Opis je aplikacija (API)“.

Celu sliku, sa pravima, stanjima objave, nasleđivanjem članova i ograničenjima, daje `docs/feed-i-feedcreator.md` u projektu potok-ide. Traži `getGroup`, `listChildren`, `getChild`, `createChild`, `updateChild`, `withdrawChild` i `previewDescription` iz App API-ja, pa radi tek uz verziju potok-a koja ih ima.

## Postavljanje

```
Vesti              grupa sa aplikacijom Feed
└── .feed          ovde stoji FeedCreator
    ├── Prva vest      objava: njen opis je tekst
    └── Druga vest
```

1. Pokreni `npm run build`.
2. Napravi podgrupu `.feed` sa uključenim **Nasleđuje članove** i **Opis je aplikacija (API)**, a u opis nalepi ceo `dist/potok-build.html`. Ako je roditeljska grupa javna, uključi i **Javna grupa**.
3. U `.feed` otvori **Uloge**, napravi sopstveni manifest i za ulogu **Svi** isključi **Kreiranje podgrupa**.

Admin u aplikaciji vidi šta u ovim podešavanjima ne valja. Aplikacija ne zavisi od imena `.feed`, ali Feed čita samo podgrupu tog imena.

## Formati

| Format | Polja |
|---|---|
| Vest | nadnaslov, naslov, uvod, slika, potpis, tekst |
| Slika | slika, naslov, opis |
| Citat | citat, autor, izvor |
| Događaj | naziv, datum, vreme, mesto, opis, link |
| Lista | naslov, uvod, do 10 stavki |
| Link | adresa, naslov, opis, slika |
| Obaveštenje | važnost, naslov, tekst |
| Pitanje | pitanje, dodatak |
| Slobodan tekst | naslov, markdown |

U tekstu rade `**jako**`, `*malo*`, `[link](adresa)` i obične adrese, a prazan red počinje novi pasus. Na površinama u boji nema linkova, jer im boja dolazi iz teme stranice.

## Kako radi

- **Sačuvaj** pravi zatvorenu grupu, koju vidi samo autor. **Objavi** otvara dijalog sa prekidačima **Javna grupa** i **Nasleđuje članove**, koji kaže ko će objavu videti i ko će moći da razgovara. Podrazumevana publika prati `.feed`.
- **Povuci** vraća objavu u nacrt, a nasleđeni članovi izlaze iz grupe. Običan prekidač za nasleđivanje to ne bi uradio, pa je zaključan posle objave.
- Aplikacija radi samo za onog ko sme da menja `.feed`. Ostali vide kratko objašnjenje.
- Pregled ide preko servera, kroz isti sanitizer kroz koji prolazi i Feed. Na telefonu je na posebnoj kartici, a na širokom ekranu stoji pored forme i osvežava se posle pauze u kucanju.
- Opis je HTML sa stilovima u tagovima, a prvi red je komentar sa poljima od kojih je napravljen. Sanitizer ga briše iz prikaza. Otisak u komentaru otkriva ručnu izmenu teksta: takva objava se otvara kao slobodan tekst, uz ponudu da se vrati na šablon.
- Grupa bez komentara otvara se kao slobodan tekst, a grupa koja je aplikacija ne uređuje se ovde, nego se otvara njena strana.
- Slika sa uređaja smanjuje se na najviše 1080 piksela i postaje slika grupe. Adresa joj se zna tek kad grupa postoji, pa slika ide u prvom pozivu, a tekst i publika u drugom. Tako niko ne vidi objavu bez slike, a ponovni pokušaj posle greške menja istu grupu.
- Nedovršen tekst se čuva u `localStorage`, jer se aplikacija ponovo učitava kad se veza obnovi. Slika sa uređaja ne staje u taj limit, pa se posle obnove bira ponovo.
- Ako server ne odgovori za 10 s, aplikacija u listi traži grupu istog imena i autora, da ponovni klik ne napravi duplikat.

## Komande

```sh
npm install
npm run dev      # dev mock potok API-ja na portu 5175
npm test         # vitest testovi
npm run build    # tsc + vite build → dist/potok-build.html
```

U dev-u primer podataka zadaje `?seed` u URL-u:

| URL | Šta prikazuje |
|---|---|
| `/?seed` | objave u svim stanjima, među njima i ručno menjana i aplikacija |
| `/?seed=empty` | grupu bez objava |
| `/?seed=setup` | grupu sa svim greškama u podešavanju |
| `/?seed=viewer` | gledaoca koji ne sme da menja grupu |

Mock samo grubo oponaša sanitizer. Pre objavljivanja nove verzije šablon treba videti u pravom potok-u.

## Struktura

| Fajl | Šta je |
|---|---|
| [src/templates.ts](src/templates.ts) | formati: polja i HTML koji prave |
| [src/post.ts](src/post.ts) | opis grupe i nazad: komentar sa poljima, otisak |
| [src/html.ts](src/html.ts) | escape, adrese, tekst sa oznakama |
| [src/audience.ts](src/audience.ts) | stanje objave, ko je vidi, provere podešavanja |
| [src/creator.ts](src/creator.ts) | stanje aplikacije: lista, forma, čuvanje, povlačenje |
| [src/ui.ts](src/ui.ts) | lit-html prikaz |
| [src/image.ts](src/image.ts) | smanjivanje slike |
| [src/style.css](src/style.css) | Tailwind, daisyUI sa prefiksom `d-` |
| [src/sanitizer.test.ts](src/sanitizer.test.ts) | kopija pravila sanitizera, provera svih formata |
| [src/main.ts](src/main.ts) | pokretanje |
| [src/dev-tools.ts](src/dev-tools.ts), [src/dev-theme.css](src/dev-theme.css) | samo za dev: primer objava i zamena za temu stranice |

`src/potok.ts`, `src/potok-dev.ts`, `vite.config.ts` i `tsconfig.json` su iz šablona, bez izmena.

Ako se u potok-u promeni `RichContentScrubber`, treba ažurirati i `src/sanitizer.test.ts`.

## Provereno

Na pravom potok-u, u Chrome-u, sa svih devet formata, svetlom i tamnom temom i širinom telefona. Na stvarnim iOS i Android uređajima nije provereno, a najviše treba pogledati izbor slike i tastaturu preko forme.

## Licenca

MIT, vidi [LICENSE](LICENSE).
