---
jurisdiction: EU
sources:
  - name: "EUR-Lex"
    authority: EU
    url: https://eur-lex.europa.eu/
    document_types: [regulation, directive]
    crawl_frequency: weekly
    format: html
    language: en

  - name: "EBA Guidelines"
    authority: EBA
    url: https://www.eba.europa.eu/regulation-and-policy/guidelines
    document_types: [guideline]
    crawl_frequency: weekly
    format: html
    language: en

  - name: "ESMA Guidelines"
    authority: ESMA
    url: https://www.esma.europa.eu/databases-library/guidelines
    document_types: [guideline]
    crawl_frequency: weekly
    format: html
    language: en
---

# EU Sources

## EUR-Lex

The primary source for EU regulations and directives. Required for building the `IMPLEMENTS` relation from national regulation up to EU level.

## European Supervisory Authorities

EBA, ESMA, and EIOPA publish guidelines that national authorities are expected to follow. These create `SUPPLEMENTS` relations to the underlying EU regulations.
