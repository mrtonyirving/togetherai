---
jurisdiction: SE
sources:
  - name: "FI Sanctions"
    authority: Finansinspektionen
    url: https://www.fi.se/sv/publicerade-dokument/sanktioner/
    document_types: [enforcement-action]
    crawl_frequency: daily
    format: html
    language: sv
    parser_notes: "Paginated list. Each entry links to a PDF decision."

  - name: "FI Regulations (FFFS)"
    authority: Finansinspektionen
    url: https://www.fi.se/sv/vara-register/forfattningssamling/
    document_types: [regulation]
    crawl_frequency: weekly
    format: html
    language: sv
    parser_notes: "Searchable register. Regulations available as PDF."

  - name: "FI Guidelines"
    authority: Finansinspektionen
    url: https://www.fi.se/sv/publicerade-dokument/vagledningar/
    document_types: [guideline]
    crawl_frequency: weekly
    format: html
    language: sv
---

# Swedish Sources

## Finansinspektionen (FI)

FI publishes enforcement actions, regulations, and guidelines on its website. Key source pages are listed above in the frontmatter.

### Sanctions page

The sanctions page is the primary source for enforcement actions. It is a paginated HTML list where each entry links to a PDF containing the full decision. The crawler needs to handle pagination and PDF extraction.

### FFFS register

FI's regulation register (författningssamling) contains all FFFS regulations. These are referenced by enforcement actions and are needed to build the `ENFORCES` relation chain.
