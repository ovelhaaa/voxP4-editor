# VoxP4 Reference Vocal Audio Library

Esta pasta contém as amostras de áudio vocal distribuídas nativamente com o **VoxP4 Web Editor**.
Essas amostras permitem a qualquer usuário testar e auditar os efeitos do processador DSP sem a necessidade de gravar ou subir arquivos próprios.

---

## 1. Amostras e Casos de Teste do DSP

| Arquivo | Nome / Registro | Duração | Foco do DSP |
| :--- | :--- | :--- | :--- |
| `vocal-female-clean.wav` | **Female Clean** · Melódica | 12.0s | Harmonia diatônica, afinação, reverb, delay estéreo |
| `vocal-male-clean.wav` | **Male Clean** · Falada/Melódica | 4.1s | Tracking em registro masculino médio (~130 Hz), saturação, compressor |
| `vocal-low-register.wav` | **Low Register** · Barítono | 3.6s | Detecção de graves no YIN (~100 Hz), síntese PSOLA com janelas longas |
| `vocal-high-register.wav` | **High Register** · Agudo Feminino | 3.4s | Tracking de frequências fundamentais altas (~240 Hz), preservação de formantes |
| `vocal-articulation.wav` | **Articulation Test** · Plosivas e fricativas | 3.9s | Detecção de onset, pontes de plosivas (P, T, K, B, D) e unvoiced handling |
| `vocal-sustained.wav` | **Sustained Singing** · Vogal sustentada | 6.8s | Estabilidade de pitch shifting, filtros LPC de formante, chorus e microshift |

---

## 2. Pipeline de Normalização

Todas as amostras foram estritamente preparadas e normalizadas segundo os princípios do projeto:
1. **Formato**: WAV, PCM 16-bit com sinal (`int16_t`).
2. **Canais**: Mono (1 canal).
3. **Taxa de Amostragem**: 48.000 Hz nativo (taxa de operação do DSP VoxP4).
4. **Normalização de Pico**: Pico fixado conservadoramente em -1.0 dBFS (amplitude 0.89125), garantindo headroom contra intersample peaks e saturação no compressor/drive.
5. **Processamento Artístico**: Nenhum processamento ou efeito adicional foi adicionado. Os arquivos são puramente "dry".

---

## 3. Proveniência e Licenças

1. **`vocal-female-clean.wav` & `vocal-sustained.wav`**:
   - Excertos da gravação de estúdio oficial do VoxP4 (`samples/dry-acapella-leave-this-place_95bpm.wav`), mantida sob licença permissiva e utilizada como fixture golden do projeto.
2. **`vocal-male-clean.wav`, `vocal-low-register.wav`, `vocal-high-register.wav`, `vocal-articulation.wav`**:
   - Fonte: **CMU ARCTIC speech synthesis database**, Language Technologies Institute, Carnegie Mellon University.
   - Licença: Permissiva / Free Software (CMU Sphinx style / Public Domain Compatible). Livre para qualquer propósito comercial, educacional ou de pesquisa.
   - Speakers: `BDL` (male US), `JMK` (male Canadian baritone), `SLT` (female US).
