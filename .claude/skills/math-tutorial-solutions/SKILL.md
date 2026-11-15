---
name: "math-tutorial-solutions"
description: "Solve math tutorial/homework questions as a LaTeX PDF in Haykal's format: one step per line, sign tables for inequalities, substitution checks for non-polynomial equations, boxed answers."
---

# Math tutorial solutions (PDF, paper-ready)

Use when the user supplies tutorial/homework questions (attached PDFs, pasted text, or a list like "Ex 1.1: 3, 5, 6; Review: 2(l), 4(b)") and wants worked solutions. The output is ONE typeset PDF the user can copy onto paper line by line.

## Workflow
1. Read the files. If a question list and a textbook file are separate, the list says which questions to solve; find each in the textbook. Text extraction (pdftotext) loses fractions, exponents and radicals, so rasterize the pages (pdftoppm -r 80) and LOOK at them to read each question exactly. Do not guess ambiguous notation.
2. Solve every question. Verify with sympy (pip install --break-system-packages sympy) and compare to any answer key in the booklet. Fix mismatches before writing.
3. Write the solutions in LaTeX and compile with pdflatex (run twice). Check the rendered pages as images for bad page breaks, then deliver the PDF with SendUserFile.
4. Final reply: one or two sentences, no recap of steps.

## Format rules (follow exactly)
- Real typeset maths: stacked \frac fractions, \sqrt, superscripts. Never plain-text maths like x^2 or a/b.
- ONE STEP PER LINE. Use `align*` with `&=` so the equals signs line up, one transformation per row. Put reasons in the right margin with `&&\text{(square both sides)}`. No sentences that cram several steps together.
- Group by exercise with `\section*{...}` and label each question with `\Q{Q3.\quad <question>}`.
- Every question ends with a boxed answer: `\ANS{...}`.
- Rejected or extraneous values are shown explicitly and rejected with a reason (e.g. x must be >= 0, u > 0).
- Case work (absolute values, piecewise): label `\textbf{Case 1:}`, `\textbf{Case 2:}`, each with its own aligned steps, then intersect with the case condition.
- INEQUALITIES: always solve with a SIGN TABLE, never a number line or graph (the only number line allowed is the intersection drawing for absolute-value inequalities, below). Columns: label | (-inf,a) | a | (a,b) | b | (b,inf). One row per factor, last row the combined expression (undef where a denominator is 0, 0 at roots). Rearrange to 0 on one side and factor first, state the critical points, then read off the answer. Say which critical points are included/excluded. ABSOLUTE-VALUE INEQUALITIES: do NOT use sign-of-the-fraction case splits or a preliminary RHS>=0 step. Keep it simple: do NOT write the general rule (no `|A|\le B\iff ...` display). Just note any excluded x (denominator zero), say in one plain sentence that the expression is between -B and B (for `\ge`: outside), and write the compound inequality with the actual expressions, e.g. `-B\le A\le B`. Split it into two inequalities (Part (i) right, Part (ii) left), solve EACH with its own sign table (rearrange to 0 on one side first), then show the Intersection on a NUMBER LINE (TikZ, in the style of Haykal's handwritten notes): a horizontal axis with ticks and labels at every critical point (below the axis), the solution set of Part (i) drawn as thick segments on a line above it, Part (ii) on a line above that, with filled dots for included endpoints, open dots for excluded ones (e.g. x=1 undefined) and arrows for unbounded ends, dashed vertical guide lines from each critical point, and the overlap hatched (`pattern=north east lines`, `pattern color=orange!80`). Finish with one line stating the hatched result, then the boxed answer. (For `\le` the answer is the overlap; for `\ge` it is the union of both.)
- CHECKING: after every NON-POLYNOMIAL equation (radicals, rational equations, absolute values, fractional powers, anything where we squared or cross-multiplied) add `\textbf{Check}` and substitute EACH candidate into the ORIGINAL equation, one step per line in `align*`, ending with `\checkmark`. Show rejected candidates with the reason. Polynomial and complex-number equations need no check.
- DECIMALS OVER FRACTIONS for ugly roots: when the quadratic formula gives irrational or ugly roots (surds, or complex roots with surds), after the exact line add steps substituting the decimal value of the root (e.g. `x&\approx\frac{3\pm4.1231}{2}`) and then the decimal roots to 4 d.p. (`x\approx3.5616`). The boxed answer is the decimal rounded to 3 d.p. with the exact form in brackets: `\ANS{$x\approx3.562$\quad (exact: $x=\dfrac{3+\sqrt{17}}{2}$)}`. Complex roots: `x\approx0.111\pm0.657\,i`. Nice rational roots stay as fractions/integers. The same applies to CHECKS: when a candidate root is ugly, substitute its decimal value (4 d.p.) into the original equation and compute both sides in decimals, one step per line, instead of simplifying surds/fractions. Applies to quadratic-formula answers; completing-the-square and other methods keep exact answers unless they also give ugly roots.
- Complex numbers: rationalize with the conjugate step by step; write answers as a + bi. Completing the square: show every line from dividing by the leading coefficient to the final roots. Quadratic formula: state a, b, c first.
- Title block at top: `MTCF 0114 -- Tutorial N (Algebra)` style heading (use the course/tutorial name from the files) plus one line saying inequalities use sign tables.

## LaTeX template (use this preamble and macros)
```latex
\documentclass[12pt,a4paper]{article}
\usepackage[margin=20mm]{geometry}
\usepackage{amsmath,amssymb}
\usepackage[T1]{fontenc}
\usepackage{lmodern}
\usepackage{needspace}
\usepackage{tikz}
\usetikzlibrary{patterns}
\usepackage{enumitem}
\usepackage[table]{xcolor}
\setlength{\parindent}{0pt}
\setlength{\parskip}{4pt}
\allowdisplaybreaks
\renewcommand{\arraystretch}{1.35}
\newcommand{\Q}[1]{\vspace{10pt}\par\textbf{#1}\par\vspace{-2pt}}
\newcommand{\ANS}[1]{\par\medskip\fbox{\parbox{0.9\linewidth}{\textbf{Answer:} #1}}\par}
\begin{document}
```
Sign table pattern:
```latex
\begin{center}
\begin{tabular}{|c|c|c|c|c|c|}\hline
 & $(-\infty,-7)$ & $-7$ & $(-7,\frac12)$ & $\frac12$ & $(\frac12,\infty)$\\\hline
$x+7$ & $-$ & $0$ & $+$ & $+$ & $+$\\\hline
$2x-1$ & $-$ & $-$ & $-$ & $0$ & $+$\\\hline
$(x+7)(2x-1)$ & $+$ & $0$ & $-$ & $0$ & $+$\\\hline
\end{tabular}
\end{center}
```
Check pattern (put `\needspace{12\baselineskip}` before `\textbf{Check}` so a check never splits across pages):
```latex
\needspace{12\baselineskip}\textbf{Check} $x=-1$:
\begin{align*}
\frac{x+3}{x-1}-\frac{x-1}{x+3}&=\frac{-1+3}{-1-1}-\frac{-1-1}{-1+3}\\
&=\frac{2}{-2}-\frac{-2}{2}\\
&=-1-(-1)\\
&=0 \quad\checkmark
\end{align*}
```

## Delivery
Name the file after the tutorial (e.g. Tutorial1_Solutions.pdf). Compile twice, render pages to PNG and inspect for orphaned lines or split tables, fix, then send. If the user later asks for changes (more checks, different layout), edit the .tex and recompile rather than rebuilding from scratch.