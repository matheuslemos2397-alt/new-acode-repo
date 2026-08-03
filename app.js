// Registra o PWA (Service Worker)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('PWA Instalado com sucesso!', reg.scope))
            .catch(err => console.log('Erro no PWA:', err));
    });
}

// 1. Inicia o banco (Versão 6 com nova tabela para forçar a criação limpa)
const db = new Dexie("FinanceiroDB");

db.version(6).stores({
    transacoes: '++id, tipo, valor, data, descricao',
    objetivos: '++id, nome, meta, guardado, valorMensal, imagem'
});

// ==========================================
// JANELA MODAL E PRIVACIDADE
// ==========================================
function showModal(titulo, htmlConteudo, ocultarCancelar = false) {
    return new Promise((resolve) => {
        const modal = document.getElementById('meuModal');
        document.getElementById('modal-titulo').innerText = titulo;
        document.getElementById('modal-conteudo').innerHTML = htmlConteudo;
        
        const btnConfirmar = document.getElementById('btn-modal-confirmar');
        const botoes = document.querySelector('#meuModal .botoes-acao');
        const btnCancelar = botoes.querySelector('.btn-compacto');
        
        btnCancelar.style.display = ocultarCancelar ? 'none' : 'block';

        const novoBtnConfirmar = btnConfirmar.cloneNode(true);
        btnConfirmar.parentNode.replaceChild(novoBtnConfirmar, btnConfirmar);

        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('show'), 10);

        const closeModal = (resultado) => {
            // Remove o visual, mas resolve a promessa IMEDIATAMENTE 
            // para dar tempo do código capturar os valores antes da tela sumir
            modal.classList.remove('show');
            resolve(resultado);
            
            setTimeout(() => {
                modal.style.display = 'none';
            }, 200);
        };

        novoBtnConfirmar.onclick = () => closeModal(true);
        window.fecharModal = () => closeModal(false);
    });
}

let privacidadeAtiva = false;
function togglePrivacidade() {
    privacidadeAtiva = !privacidadeAtiva;
    const btn = document.getElementById('btn-privacidade');
    
    const elementosParaBorrar = [ document.getElementById('saldo-visual') ];
    document.querySelectorAll('.valores-cofre strong').forEach(el => elementosParaBorrar.push(el));
    
    if (privacidadeAtiva) {
        btn.innerText = '🙈';
        elementosParaBorrar.forEach(el => el.classList.add('modo-privacidade-ativo'));
        document.getElementById('area-extrato').style.display = 'none';
        document.querySelector('.area-lancamento .btn-compacto').innerText = 'Ver Histórico';
    } else {
        btn.innerText = '👁️';
        elementosParaBorrar.forEach(el => el.classList.remove('modo-privacidade-ativo'));
    }
}

// ==========================================
// SALDO E TRANSAÇÕES
// ==========================================
async function carregarSaldo() {
    const transacoes = await db.transacoes.toArray();
    let saldoAtual = transacoes.reduce((acc, t) => t.tipo === 'entrada' ? acc + t.valor : acc - t.valor, 0);
    
    let elementoSaldo = document.getElementById('saldo-visual');
    elementoSaldo.innerText = `R$ ${saldoAtual.toFixed(2)}`;
    elementoSaldo.style.color = saldoAtual < 0 ? '#dc3545' : '#0056b3';
}

async function registrarTransacao(tipoSelecionado) {
    let valorDigitado = parseFloat(document.getElementById('valor-transacao').value);
    let descricaoDigitada = document.getElementById('descricao-transacao').value.trim();

    if (isNaN(valorDigitado) || valorDigitado <= 0) {
        await showModal("Ops!", "<p>Por favor, digite um valor válido.</p>", true);
        return;
    }

    await db.transacoes.add({
        tipo: tipoSelecionado,
        valor: valorDigitado,
        data: new Date().toISOString(),
        descricao: descricaoDigitada || (tipoSelecionado === 'entrada' ? 'Entrada' : 'Saída')
    });

    document.getElementById('valor-transacao').value = '';
    document.getElementById('descricao-transacao').value = '';

    await carregarSaldo();
    await carregarExtrato();
}

function toggleExtrato() {
    if (privacidadeAtiva) {
        showModal("Aviso", "<p>Desative o modo privacidade (🙈) para ver o histórico.</p>", true);
        return;
    }
    let area = document.getElementById('area-extrato');
    let btn = document.querySelector('.area-lancamento .btn-compacto');
    area.style.display = area.style.display === 'none' ? 'block' : 'none';
    btn.innerText = area.style.display === 'none' ? 'Ver Histórico' : 'Esconder Histórico';
}

async function carregarExtrato() {
    let lista = document.getElementById('lista-extrato');
    lista.innerHTML = ''; 
    const transacoes = (await db.transacoes.toArray()).reverse();

    transacoes.forEach(t => {
        let d = new Date(t.data);
        let classeCor = t.tipo === 'entrada' ? 'valor-entrada' : 'valor-saida';
        lista.innerHTML += `
            <li>
                <div class="extrato-info">
                    <span class="extrato-descricao">${t.descricao}</span>
                    <span class="extrato-data">${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
                <span class="extrato-valor ${classeCor}">${t.tipo === 'entrada' ? '+' : '-'} R$ ${t.valor.toFixed(2)}</span>
                <button class="btn-lixeira" onclick="apagarTransacao(${t.id})">🗑️</button>
            </li>`;
    });
}

async function apagarTransacao(id) {
    if (await showModal("Atenção", "<p>Excluir definitivamente este registro?</p>")) {
        await db.transacoes.delete(id);
        await carregarSaldo(); await carregarExtrato();
    }
}

// ==========================================
// SISTEMA DE METAS DINÂMICAS (Múltiplos Cofres)
// ==========================================

// 1. Renderiza todas as metas na tela
async function carregarCofres() {
    const cofres = await db.objetivos.toArray();
    const container = document.getElementById('lista-cofres');
    container.innerHTML = '';

    if (cofres.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#888; font-style:italic; padding:10px; background:transparent; box-shadow:none;">Você ainda não tem metas. Que tal criar uma?</p>';
        return;
    }

    cofres.forEach(cofre => {
        let porcentagem = Math.min((cofre.guardado / cofre.meta) * 100, 100);
        let falta = cofre.meta - cofre.guardado;
        let msgMotivacional = '';

        if (falta <= 0) {
            msgMotivacional = '🎉 Parabéns! Você já tem o dinheiro para essa meta!';
        } else if (cofre.valorMensal > 0) {
            let meses = Math.ceil(falta / cofre.valorMensal);
            let dataAlvo = new Date();
            dataAlvo.setMonth(dataAlvo.getMonth() + meses); 
            let nomeMes = dataAlvo.toLocaleString('pt-BR', { month: 'long' });
            let ano = dataAlvo.getFullYear();
            
            msgMotivacional = `💡 Mantendo <b>R$ ${cofre.valorMensal.toFixed(2)}/mês</b>, você alcança isso em <b>${meses} meses (${nomeMes}/${ano})</b>!`;
        } else {
            msgMotivacional = 'Edite a meta e defina um depósito mensal para calcularmos a data!';
        }

        container.innerHTML += `
            <div class="card-cofre">
                <div class="cofre-topo">
                    <h3>${cofre.nome}</h3>
                    <div class="botoes-topo-cofre">
                        <button class="btn-icone" onclick="editarMeta(${cofre.id})">✏️</button>
                        <button class="btn-icone lixeira" onclick="excluirMeta(${cofre.id})">🗑️</button>
                    </div>
                </div>

                <div class="valores-cofre">
                    <p>Guardado: <br><strong class="${privacidadeAtiva ? 'modo-privacidade-ativo' : ''}">R$ ${cofre.guardado.toFixed(2)}</strong></p>
                    <p>Meta: <br><strong class="${privacidadeAtiva ? 'modo-privacidade-ativo' : ''}">R$ ${cofre.meta.toFixed(2)}</strong></p>
                </div>

                <div class="progresso-container">
                    <progress value="${porcentagem}" max="100"></progress>
                    <span class="porcentagem-txt">${porcentagem.toFixed(0)}%</span>
                </div>

                <p class="estimativa">${msgMotivacional}</p>

                <div style="display: flex; gap: 10px;">
                    <button class="btn-cofre" onclick="depositarCofre(${cofre.id}, '${cofre.nome}')" style="flex: 1; padding: 10px; font-size: 14px;">Depositar</button>
                    <button class="btn-saida" onclick="sacarCofre(${cofre.id}, '${cofre.nome}')" style="flex: 1; padding: 10px; font-size: 14px; opacity: 0.9;">Resgatar</button>
                </div>
            </div>
        `;
    });
}

// 2. Criação de nova meta
async function criarNovaMeta() {
    const html = `
        <input type="text" id="modal-input-nome" placeholder="Ex: Moto, Ferramentas, Férias">
        <input type="number" id="modal-input-meta" inputmode="decimal" step="0.01" placeholder="Qual o valor total? (R$)">
        <input type="number" id="modal-input-mensal" inputmode="decimal" step="0.01" placeholder="Pretende guardar quanto por mês? (R$)">
    `;

    if (await showModal("Nova Meta", html)) {
        let nome = document.getElementById('modal-input-nome').value.trim();
        let meta = parseFloat(document.getElementById('modal-input-meta').value);
        let valorMensal = parseFloat(document.getElementById('modal-input-mensal').value) || 0;

        if (nome && !isNaN(meta) && meta > 0) {
            await db.objetivos.add({ nome, meta, guardado: 0, valorMensal, imagem: "" });
            await carregarCofres();
        } else {
            await showModal("Erro", "<p>Nome e Valor Total são obrigatórios!</p>", true);
        }
    }
}

// 3. Edição da meta
async function editarMeta(id) {
    let cofre = await db.objetivos.get(id);
    const html = `
        <input type="text" id="modal-input-nome" value="${cofre.nome}">
        <input type="number" id="modal-input-meta" inputmode="decimal" step="0.01" value="${cofre.meta}">
        <label style="display:block; text-align:left; font-size:12px; margin-bottom:5px; color:#666;">Seu plano de depósito mensal (R$):</label>
        <input type="number" id="modal-input-mensal" inputmode="decimal" step="0.01" value="${cofre.valorMensal || ''}">
    `;

    if (await showModal("Editar Meta", html)) {
        let nome = document.getElementById('modal-input-nome').value.trim();
        let meta = parseFloat(document.getElementById('modal-input-meta').value);
        let valorMensal = parseFloat(document.getElementById('modal-input-mensal').value) || 0;

        if (nome && !isNaN(meta) && meta > 0) {
            await db.objetivos.update(id, { nome, meta, valorMensal });
            await carregarCofres();
        }
    }
}

// 4. Excluir Meta
async function excluirMeta(id) {
    let cofre = await db.objetivos.get(id);
    if (await showModal("Apagar Meta", `<p>Tem certeza que deseja apagar a meta <b>${cofre.nome}</b>?</p><p style="font-size:12px; margin-top:10px; color:#dc3545;">Dica: se tiver saldo nela, faça o resgate antes.</p>`)) {
        await db.objetivos.delete(id);
        await carregarCofres();
    }
}

// 5. Depositar / Sacar específicos para o cofre selecionado
async function depositarCofre(id, nome) {
    if (await showModal(`Depositar em: ${nome}`, `<input type="number" id="modal-input-mov" inputmode="decimal" step="0.01" placeholder="Valor (R$)">`)) {
        let valor = parseFloat(document.getElementById('modal-input-mov').value);
        if (valor > 0) {
            let c = await db.objetivos.get(id);
            await db.transacoes.add({ tipo: 'saida', valor, data: new Date().toISOString(), descricao: `Depósito: ${nome}` });
            await db.objetivos.update(id, { guardado: c.guardado + valor });
            await iniciarApp();
        }
    }
}

async function sacarCofre(id, nome) {
    let c = await db.objetivos.get(id);
    if (c.guardado <= 0) return await showModal("Ops", "<p>Esta meta está vazia.</p>", true);

    if (await showModal(`Resgatar de: ${nome}`, `<p style="margin-bottom:10px;">Disponível: R$ ${c.guardado.toFixed(2)}</p><input type="number" id="modal-input-mov" inputmode="decimal" step="0.01" placeholder="Valor do resgate (R$)">`)) {
        let valor = parseFloat(document.getElementById('modal-input-mov').value);
        if (valor > 0 && valor <= c.guardado) {
            await db.transacoes.add({ tipo: 'entrada', valor, data: new Date().toISOString(), descricao: `Resgate: ${nome}` });
            await db.objetivos.update(id, { guardado: c.guardado - valor });
            await iniciarApp();
        } else {
            await showModal("Erro", "<p>Valor inválido ou maior que o guardado.</p>", true);
        }
    }
}

async function iniciarApp() {
    await carregarSaldo();    
    await carregarExtrato();  
    await carregarCofres();    
}
// ==========================================
// BACKUP NA NUVEM (Google Sheets via SheetDB)
// ==========================================
async function sincronizarPlanilha() {
    const transacoes = await db.transacoes.toArray();
    const objetivos = await db.objetivos.toArray();
    
    if (transacoes.length === 0 && objetivos.length === 0) {
        await showModal("Ops", "<p>Você não tem dados locais para salvar na nuvem.</p>", true);
        return;
    }

    const confirmou = await showModal("Backup na Nuvem", `<p>Deseja enviar seus dados (Extrato e Metas) para o Google Sheets?</p>`);
    if (!confirmou) return;

    const btn = document.getElementById('btn-sync');
    btn.innerText = '⏳'; 

    try {
        const urlAPI = 'https://sheetdb.io/api/v1/y2fdacjtuns0x';
        
        // --- 1. ENVIA O EXTRATO PARA A ABA PRINCIPAL ---
        try { await fetch(`${urlAPI}/all`, { method: 'DELETE' }); } catch (e) {}
        
        if (transacoes.length > 0) {
            const dadosTransacoes = transacoes.map(t => ({
                id: t.id.toString(),
                tipo: t.tipo,
                valor: t.valor.toString(),
                data: t.data,
                descricao: t.descricao
            }));

            await fetch(urlAPI, {
                method: 'POST',
                headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: dadosTransacoes })
            });
        }

        // --- 2. ENVIA AS METAS PARA A ABA "Objetivos" ---
        try { await fetch(`${urlAPI}/all?sheet=Objetivos`, { method: 'DELETE' }); } catch (e) {}
        
        if (objetivos.length > 0) {
            const dadosObjetivos = objetivos.map(o => ({
                id: o.id.toString(),
                nome: o.nome,
                meta: o.meta.toString(),
                guardado: o.guardado.toString(),
                valorMensal: o.valorMensal.toString()
            }));

            await fetch(`${urlAPI}?sheet=Objetivos`, {
                method: 'POST',
                headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: dadosObjetivos })
            });
        }

        await showModal("Sucesso!", "<p>Backup completo realizado com sucesso! Suas duas abas estão atualizadas.</p>", true);
        
    } catch (erro) {
        console.error("Erro na sincronização:", erro);
        await showModal("Erro no Backup", `<p style="font-size:14px; color:#dc3545;">Não foi possível salvar na planilha.</p><p style="font-size:12px; margin-top:10px;"><b>Motivo:</b> ${erro.message}</p>`, true);
    } finally {
        btn.innerText = '☁️'; 
    }
}


iniciarApp();
