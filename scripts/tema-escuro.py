import re, colorsys, sys
f='/home/user/APP-MENTORIA-ALUNOS/src/painel/painel.css'
s=open(f).read()
M='/* ==== TEMA ESCURO: varredura automática ==== */'
if M in s: s=s[:s.index(M)].rstrip()+'\n'
NOMES={'white':'#ffffff','#fff':'#ffffff'}
def rgb(c):
    c=c.strip().lower(); c=NOMES.get(c,c)
    m=re.fullmatch(r'#([0-9a-f]{3})',c)
    if m: c='#'+''.join(x*2 for x in m.group(1))
    m=re.fullmatch(r'#([0-9a-f]{6})',c)
    if m: return tuple(int(c[i:i+2],16)/255 for i in (1,3,5))
    m=re.fullmatch(r'rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)',c)
    if m and (m.group(4) is None or float(m.group(4))>=0.9): return tuple(int(m.group(i))/255 for i in (1,2,3))
    return None
def lum(r,g,b): return 0.2126*r+0.7152*g+0.0722*b
EXC=re.compile(r'chave|::after|::before|knob|\bsw\b|ej-sw|cc-|\.cf-|pv-|\bcel\b|ce-cel|toast|ouro|al-botao-ouro|\.botao\b|kx-aa|cfg-pic|selo3|ka-capa|cur-capa|capa|modal-fundo|::selection|cc2-tipo|eng-rosca|aa-av|avatar|\.pf-|lado|atu-|vg-chip\[aria-pressed|chip\[aria-pressed|\[aria-pressed="true"\]|\[aria-current|\[aria-selected="true"\]|:checked|mbe-|pvn-|\.on\b')
out=[]
def proc(block, prefixo_media=None):
    for m in re.finditer(r'([^{}@]+)\{([^{}]*)\}', block):
        sel, decl = m.group(1).strip(), m.group(2)
        if not sel or sel.startswith('@') or 'data-tema' in sel or sel.startswith('from') or sel.startswith('to') or re.fullmatch(r'[\d.%, ]+',sel): continue
        if EXC.search(sel): continue
        nova=[]
        bg=re.search(r'background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,6}|white|rgba?\([^)]*\))\s*(!important)?\s*(?:;|$)', decl)
        clara=False
        if bg:
            c=rgb(bg.group(1))
            if c and lum(*c)>0.82:
                h,l,sat=colorsys.rgb_to_hls(*c); clara=True
                if sat<0.35 or l>0.95 and sat<0.6: nova.append('background: var(--aa-cartao, rgba(255,255,255,.04)) !important')
                else:
                    r,g,b=colorsys.hls_to_rgb(h,0.5,min(1,sat)); nova.append(f'background: rgba({int(r*255)},{int(g*255)},{int(b*255)},.16) !important')
        for cm in re.finditer(r'(?<![-\w])color\s*:\s*(#[0-9a-fA-F]{3,6}|rgba?\([^)]*\))', decl):
            c=rgb(cm.group(1))
            if not c: continue
            h,l,sat=colorsys.rgb_to_hls(*c)
            if lum(*c)<0.3:
                if sat<0.25: nova.append('color: var(--texto) !important')
                else:
                    r,g,b=colorsys.hls_to_rgb(h,0.72,min(1,sat)); nova.append(f'color: rgb({int(r*255)},{int(g*255)},{int(b*255)}) !important')
        bc=re.search(r'border(?:-color)?\s*:[^;]*?(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\b', decl)
        if bc and clara:
            c=rgb(bc.group(1))
            if c and lum(*c)>0.75: nova.append('border-color: var(--linha-suave) !important')
        if nova:
            sels=', '.join('html:not([data-tema="claro"]) '+x.strip() for x in sel.split(',') if x.strip())
            out.append((prefixo_media, f'{sels} {{ {"; ".join(dict.fromkeys(nova))}; }}'))
# separa @media
pos=0
for m in re.finditer(r'@media[^{]+\{((?:[^{}]*\{[^{}]*\})*)\s*\}', s):
    proc(s[pos:m.start()]); proc(m.group(1), m.group(0)[:m.group(0).index('{')].strip()); pos=m.end()
proc(s[pos:])
linhas=[M]
for med,r in out:
    linhas.append(f'{med} {{ {r} }}' if med else r)
s=s+'\n'+'\n'.join(linhas)+'\n'
open(f,'w').write(s)
print(len(out),'regras')
