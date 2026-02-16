# Sources

The source registry defines all regulatory sources that our crawlers monitor. Each source entry specifies the authority, URL, document types available, crawl frequency, and any special parsing notes.

## Source files by jurisdiction

| Jurisdiction | Sources |
|---|---|
| [Sweden](se-sources.md) | Finansinspektionen |
| [Norway](no-sources.md) | Finanstilsynet |
| [Denmark](dk-sources.md) | Finanstilsynet (DK) |
| [Spain](es-sources.md) | CNMV, Banco de España, DGSFP |
| [EU](eu-sources.md) | EBA, ESMA, EIOPA, EUR-Lex |

## Source entry structure

Each source is defined with the following metadata in the YAML frontmatter:

```yaml
sources:
  - name: "FI Sanctions"
    authority: Finansinspektionen
    url: https://www.fi.se/sv/publicerade-dokument/sanktioner/
    document_types: [enforcement-action]
    crawl_frequency: daily
    format: html
    language: sv
    parser_notes: "Paginated list. Each entry links to a PDF decision."
```
