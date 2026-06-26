---
id: score-regression-guard
title: Score regression guard — enforce score_after > score_before server-side
status: planned
created: 2026-06-26
updated: 2026-06-26
type: feature
---

## Goal

Przenieść egzekucję invariantu I-1 (score_after > score_before) z UI do serwera.
Dziś jedynym strażnikiem jest checkbox pre-selection w TransformationSession.tsx
— jedno kliknięcie go pomija. Po zmianie serwer zwraca 409 przy regresji score,
klient obsługuje dialog z deltą.

## Source

Domain analysis: context/domain/02-invariant-aggregate-refactor.md
Research: context/changes/core-layer-spread/research.md (potwierdzenie braku enforcement)
