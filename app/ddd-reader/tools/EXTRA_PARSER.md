# Extra parser (opzionale) – integrazione locale

Se vuoi migliorare ulteriormente il parsing (senza chiamate online), puoi integrare un parser esterno locale.

## Come funziona

L'app legge la variabile d'ambiente:

- `DDD_EXTRA_PARSER_CMD`

Se impostata, viene eseguito **un comando aggiuntivo** come parser:

- il comando riceve il percorso del file `.ddd` come **ultimo argomento**
- deve stampare su `stdout` un JSON valido
- l'output JSON viene unito (`deep merge`) agli altri parser nel campo `combinedData`

## Esempi

### Windows (PowerShell)

```powershell
$env:DDD_EXTRA_PARSER_CMD = "python tools\\my_extra_parser.py"
npm run dev
```

### macOS/Linux (bash)

```bash
export DDD_EXTRA_PARSER_CMD="python3 tools/my_extra_parser.py"
npm run dev
```

## Best practices

- Mantieni l'output **stabile**: stessi campi, stesso schema.
- Usa nomi chiari e prefissi per evitare collisioni (es. `extra.<nome_parser>.<campo>`).
- Se il parser fallisce, l'app continua comunque con gli altri.
