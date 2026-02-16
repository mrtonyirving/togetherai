---
jurisdiction: ES
sources:
  - name: "CNMV Sanctions"
    authority: CNMV
    url: https://www.cnmv.es/portal/Sanciones-Recursos/Sanciones.aspx
    document_types: [enforcement-action]
    crawl_frequency: daily
    format: html
    language: es

  - name: "Banco de España Sanctions"
    authority: Banco de España
    url: https://www.bde.es/wbe/es/entidades-profesionales/registro-entidades/sanciones/
    document_types: [enforcement-action]
    crawl_frequency: daily
    format: html
    language: es

  - name: "CNMV Regulations"
    authority: CNMV
    url: https://www.cnmv.es/portal/legislacion/legislacion.aspx
    document_types: [regulation, guideline]
    crawl_frequency: weekly
    format: html
    language: es
---

# Spanish Sources

## Multiple authorities

Spain requires crawling three separate authorities: CNMV, Banco de España, and DGSFP.

!!! note "TODO"
    Document the specific crawl paths and parsing requirements for Spanish sources.
