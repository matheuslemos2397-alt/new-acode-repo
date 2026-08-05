// ============================
// CONFIGURAÇÃO
// ============================
const CONFIG = {
    // ⚠️ SUBSTITUA PELA SUA URL DO SHEETDB (ou deixe vazio para desativar nuvem)
    SHEETDB_URL: 'https://sheetdb.io/api/v1/y2fdacjtuns0x',
    VERSAO_DB: 7
};

const CATEGORIAS = {
    alimentacao: { icone: '🍔', cor: '#f59e0b' },
    transporte: { icone: '🚗', cor: '#3b82f6' },
    moradia: { icone: '🏠', cor: '#8b5cf6' },
    lazer: { icone: '🎉', cor: '#ec4899' },
    saude: { icone: '⚕️', cor: '#ef4444' },
    salario: { icone: '💼', cor: '#10b981' },
    investimento: { icone: '📈', cor: '#0ea5e9' },
    outros: { icone: '📦', cor: '#64748b' }
};

// ============================
// BANCO DE DADOS
// ============================
const db = new Dexie("FinanceiroDB");
db.version(CONFIG.VERSAO_DB).stores({
    transacoes: '++id, tipo, valor, data, descricao, categoria',
    objetivos: '++id, nome, meta, guardado, valorMensal, imagem'
});

// ============================
// CLASSE PRINCIPAL
// ============================
class AppFinanceiro {
    constructor() {
        this.privacidadeAtiva = false;
        this.init();
    }

    async init() {
        // Data padrão: hoje
        document.getElementById('data-transacao').valueAsDate = new Date();
        
        await this.carregarSaldo();
        await this.carregarExtrato();
        await this.carregarCofres();
        this.preencherFiltroMeses();
        
        // Registra SW
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').catch(console.error);
        }
    }

    // ============================
    // UTILITÁRIOS
    // ============================
    formatarMoeda(valor) {
        return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }

    formatarData(iso) {
        const d = new Date(iso);
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    }

    toast(mensagem, tipo = 'success') {
        const container = document.getElementById('toast-container');
        const el = document.createElement('div');
        el.className = `toast ${tipo}`;
        el.textContent = mensagem;
        container.appendChild(el);
        setTimeout(() => el.remove(), 3000);
    }

    // ============================
    // MODAL
    // ============================
    showModal(titulo, htmlConteudo, ocultarCancelar = false) {
        return new Promise((resolve) => {
            const modal = document.getElementById('meuModal');
            document.getElementById('modal-titulo').innerText = titulo;
            document.getElementById('modal-conteudo').innerHTML = htmlConteudo;

            const btnConfirmar = document.getElementById('btn-modal-confirmar');
            const botoes = document.querySelector('#meuModal .modal-actions');
            const btnCancelar = botoes.querySelector('.btn-compacto');

            btnCancelar.style.display = ocultarCancelar ? 'none' : 'block';

            const novoBtn = btnConfirmar.cloneNode(true);
            btnConfirmar.parentNode.replaceChild(novoBtn, btnConfirmar);

            modal.style.display = 'flex';
            requestAnimationFrame(() => modal.classList.add('show'));

            this._closeModal = (resultado) => {
                modal.classList.remove('show');
                resolve(resultado);
                setTimeout(() => { modal.style.display = 'none'; }, 250);
            };

            novoBtn.onclick = () => this._closeModal(true);
        });
    }

    fecharModal(resultado = false) {
        if (this._closeModal) this._closeModal(resultado);
    }

    // ============================
    // PRIVACIDADE
    // ============================
    togglePrivacidade() {
        this.privacidadeAtiva = !this.privacidadeAtiva;
        const btn = document.getElementById('btn-privacidade');
        const elementos = [
            document.getElementById('saldo-visual'),
            ...document.querySelectorAll('.valores-cofre strong')
        ];

        if (this.privacidadeAtiva) {
            btn.innerText = '🙈';
            elementos.forEach(el => el.classList.add('modo-privacidade-ativo'));
            document.getElementById('area-extrato').style.display = 'none';
            document.getElementById('btn-toggle-extrato').innerText = 'Ver Histórico';
        } else {
            btn.innerText = '👁️';
            elementos.forEach(el => el.classList.remove('modo-privacidade-ativo'));
        }
    }

    // ============================
    // SALDO & RESUMO
    // ============================
    async carregarSaldo() {
        const transacoes = await db.transacoes.toArray();
        const hoje = new Date();
        const mesAtual = hoje.getMonth();
        const anoAtual = hoje.getFullYear();

        let saldo = 0, receitas = 0, despesas = 0;

        transacoes.forEach(t => {
            const d = new Date(t.data);
            const val = t.valor;
            saldo += (t.tipo === 'entrada' ? val : -val);
            
            if (d.getMonth() === mesAtual && d.getFullYear() === anoAtual) {
                if (t.tipo === 'entrada') receitas += val;
                else despesas += val;
            }
        });

        const elSaldo = document.getElementById('saldo-visual');
        elSaldo.innerText = this.formatarMoeda(saldo);
        elSaldo.className = `saldo-valor ${saldo < 0 ? 'negativo' : 'positivo'}`;

        document.querySelector('.receita-mes').innerText = `↑ ${this.formatarMoeda(receitas)}`;
        document.querySelector('.despesa-mes').innerText = `↓ ${this.formatarMoeda(despesas)}`;
    }

    // ============================
    // TRANSAÇÕES
    // ============================
    async registrarTransacao(tipo) {
        const valor = parseFloat(document.getElementById('valor-transacao').value);
        const descricao = document.getElementById('descricao-transacao').value.trim();
        const categoria = document.getElementById('categoria-transacao').value;
        const dataInput = document.getElementById('data-transacao').value;

        if (isNaN(valor) || valor <= 0) {
            this.toast('Digite um valor válido.', 'error');
            return;
        }

        await db.transacoes.add({
            tipo,
            valor,
            data: dataInput ? new Date(dataInput + 'T12:00:00').toISOString() : new Date().toISOString(),
            descricao: descricao || (tipo === 'entrada' ? 'Entrada' : 'Saída'),
            categoria
        });

        // Limpa form
        document.getElementById('valor-transacao').value = '';
        document.getElementById('descricao-transacao').value = '';
        document.getElementById('data-transacao').valueAsDate = new Date();

        this.toast(tipo === 'entrada' ? 'Entrada registrada!' : 'Gasto registrado!');
        await this.carregarSaldo();
        await this.carregarExtrato();
    }

    toggleExtrato() {
        if (this.privacidadeAtiva) {
            this.showModal("Aviso", "<p>Desative o modo privacidade para ver o histórico.</p>", true);
            return;
        }
        const area = document.getElementById('area-extrato');
        const btn = document.getElementById('btn-toggle-extrato');
        const visivel = area.style.display !== 'none';
        area.style.display = visivel ? 'none' : 'block';
        btn.innerText = visivel ? 'Ver Histórico' : 'Esconder Histórico';
    }

    preencherFiltroMeses() {
        const select = document.getElementById('filtro-mes');
        const meses = [
            'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
            'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
        ];
        const atual = new Date().getMonth();
        
        meses.forEach((m, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.text = m;
            if (i === atual) opt.selected = true;
            select.appendChild(opt);
        });
    }

    async carregarExtrato() {
        const lista = document.getElementById('lista-extrato');
        const filtro = document.getElementById('filtro-mes').value;
        lista.innerHTML = '';

        let transacoes = await db.transacoes.toArray();
        transacoes.reverse();

        if (filtro !== 'todos') {
            const mes = parseInt(filtro);
            const ano = new Date().getFullYear();
            transacoes = transacoes.filter(t => {
                const d = new Date(t.data);
                return d.getMonth() === mes && d.getFullYear() === ano;
            });
        }

        const vazio = document.getElementById('extrato-vazio');
        const stats = document.getElementById('extrato-stats');

        if (transacoes.length === 0) {
            vazio.style.display = 'block';
            stats.style.display = 'none';
            return;
        }
        vazio.style.display = 'none';
        stats.style.display = 'flex';

        let totalEntradas = 0, totalSaidas = 0;
        transacoes.forEach(t => {
            if (t.tipo === 'entrada') totalEntradas += t.valor;
            else totalSaidas += t.valor;

            const cat = CATEGORIAS[t.categoria] || CATEGORIAS.outros;
            const classe = t.tipo === 'entrada' ? 'valor-entrada' : 'valor-saida';
            const sinal = t.tipo === 'entrada' ? '+' : '-';

            lista.innerHTML += `
                <li>
                    <div class="extrato-icone" style="background:${cat.cor}20">${cat.icone}</div>
                    <div class="extrato-info">
                        <span class="extrato-descricao">${t.descricao}</span>
                        <span class="extrato-meta">${cat.icone} ${this.formatarData(t.data)}</span>
                    </div>
                    <span class="extrato-valor ${classe}">${sinal} ${this.formatarMoeda(t.valor)}</span>
                    <button class="btn-lixeira" onclick="app.apagarTransacao(${t.id})">🗑️</button>
                </li>
            `;
        });

        stats.innerHTML = `
            <span>${transacoes.length} registro(s)</span>
            <span style="color:var(--success)">Receitas: ${this.formatarMoeda(totalEntradas)}</span>
            <span style="color:var(--danger)">Despesas: ${this.formatarMoeda(totalSaidas)}</span>
        `;
    }

    async apagarTransacao(id) {
        if (await this.showModal("Atenção", "<p>Excluir este registro permanentemente?</p>")) {
            await db.transacoes.delete(id);
            this.toast('Registro excluído.');
            await this.carregarSaldo();
            await this.carregarExtrato();
        }
    }

    // ============================
    // METAS / COFRES
    // ============================
    async carregarCofres() {
        const cofres = await db.objetivos.toArray();
        const container = document.getElementById('lista-cofres');
        const vazio = document.getElementById('cofres-vazio');
        container.innerHTML = '';

        if (cofres.length === 0) {
            vazio.style.display = 'block';
            return;
        }
        vazio.style.display = 'none';

        cofres.forEach((cofre, index) => {
            const pct = Math.min((cofre.guardado / cofre.meta) * 100, 100);
            const falta = cofre.meta - cofre.guardado;
            let msg = '';

            if (falta <= 0) {
                msg = '🎉 Meta alcançada! Parabéns!';
            } else if (cofre.valorMensal > 0) {
                const meses = Math.ceil(falta / cofre.valorMensal);
                const dataAlvo = new Date();
                dataAlvo.setMonth(dataAlvo.getMonth() + meses);
                msg = `💡 Em <b>${meses} meses</b> (${dataAlvo.toLocaleString('pt-BR',{month:'short', year:'numeric'})}) você chega lá!`;
            } else {
                msg = 'Defina um valor mensal para calcular a previsão.';
            }

            const el = document.createElement('div');
            el.className = 'card-cofre';
            el.style.animationDelay = `${index * 0.05}s`;
            el.innerHTML = `
                <div class="cofre-topo">
                    <h3>${cofre.nome}</h3>
                    <div class="botoes-topo-cofre">
                        <button class="btn-icon" style="width:32px;height:32px;font-size:14px;" onclick="app.editarMeta(${cofre.id})">✏️</button>
                        <button class="btn-icon" style="width:32px;height:32px;font-size:14px;color:var(--danger);" onclick="app.excluirMeta(${cofre.id})">🗑️</button>
                    </div>
                </div>
                <div class="valores-cofre">
                    <p>Guardado<br><strong class="${this.privacidadeAtiva ? 'modo-privacidade-ativo' : ''}">${this.formatarMoeda(cofre.guardado)}</strong></p>
                    <p>Meta<br><strong class="${this.privacidadeAtiva ? 'modo-privacidade-ativo' : ''}">${this.formatarMoeda(cofre.meta)}</strong></p>
                </div>
                <div class="progresso-container">
                    <progress value="${pct}" max="100"></progress>
                    <span class="porcentagem-txt">${pct.toFixed(0)}%</span>
                </div>
                <p class="estimativa">${msg}</p>
                <div class="botoes-acao">
                    <button class="btn-cofre" onclick="app.depositarCofre(${cofre.id}, '${cofre.nome}')">Depositar</button>
                    <button class="btn-cofre-resgatar" onclick="app.sacarCofre(${cofre.id}, '${cofre.nome}')">Resgatar</button>
                </div>
            `;
            container.appendChild(el);
        });
    }

    async criarNovaMeta() {
        const html = `
            <input type="text" id="modal-nome" placeholder="Nome da meta (ex: Moto)">
            <input type="number" id="modal-meta" step="0.01" placeholder="Valor total (R$)">
            <input type="number" id="modal-mensal" step="0.01" placeholder="Quanto guardar por mês? (opcional)">
        `;
        if (await this.showModal("Nova Meta", html)) {
            const nome = document.getElementById('modal-nome').value.trim();
            const meta = parseFloat(document.getElementById('modal-meta').value);
            const mensal = parseFloat(document.getElementById('modal-mensal').value) || 0;

            if (nome && !isNaN(meta) && meta > 0) {
                await db.objetivos.add({ nome, meta, guardado: 0, valorMensal: mensal, imagem: '' });
                this.toast('Meta criada com sucesso!');
                await this.carregarCofres();
            } else {
                this.toast('Preencha nome e valor total.', 'error');
            }
        }
    }

    async editarMeta(id) {
        const c = await db.objetivos.get(id);
        const html = `
            <input type="text" id="modal-nome" value="${c.nome}">
            <input type="number" id="modal-meta" step="0.01" value="${c.meta}">
            <input type="number" id="modal-mensal" step="0.01" value="${c.valorMensal || ''}">
        `;
        if (await this.showModal("Editar Meta", html)) {
            const nome = document.getElementById('modal-nome').value.trim();
            const meta = parseFloat(document.getElementById('modal-meta').value);
            const mensal = parseFloat(document.getElementById('modal-mensal').value) || 0;

            if (nome && !isNaN(meta) && meta > 0) {
                await db.objetivos.update(id, { nome, meta, valorMensal: mensal });
                this.toast('Meta atualizada!');
                await this.carregarCofres();
            }
        }
    }

    async excluirMeta(id) {
        const c = await db.objetivos.get(id);
        if (await this.showModal("Excluir Meta", `<p>Deseja excluir <b>${c.nome}</b>?</p><p style="font-size:12px;color:var(--danger);margin-top:8px;">Resgate o saldo antes de apagar.</p>`)) {
            await db.objetivos.delete(id);
            this.toast('Meta excluída.');
            await this.carregarCofres();
        }
    }

    async depositarCofre(id, nome) {
        if (await this.showModal(`Depositar em ${nome}`, `<input type="number" id="modal-mov" step="0.01" placeholder="Valor (R$)">`)) {
            const valor = parseFloat(document.getElementById('modal-mov').value);
            if (valor > 0) {
                const c = await db.objetivos.get(id);
                await db.transacoes.add({
                    tipo: 'saida', valor,
                    data: new Date().toISOString(),
                    descricao: `Depósito: ${nome}`, categoria: 'outros'
                });
                await db.objetivos.update(id, { guardado: c.guardado + valor });
                this.toast(`Depositado ${this.formatarMoeda(valor)} em ${nome}`);
                await this.init();
            }
        }
    }

    async sacarCofre(id, nome) {
        const c = await db.objetivos.get(id);
        if (c.guardado <= 0) {
            this.toast('Esta meta está vazia.', 'error');
            return;
        }
        if (await this.showModal(`Resgatar de ${nome}`, `<p>Disponível: <b>${this.formatarMoeda(c.guardado)}</b></p><input type="number" id="modal-mov" step="0.01" placeholder="Valor do resgate">`)) {
            const valor = parseFloat(document.getElementById('modal-mov').value);
            if (valor > 0 && valor <= c.guardado) {
                await db.transacoes.add({
                    tipo: 'entrada', valor,
                    data: new Date().toISOString(),
                    descricao: `Resgate: ${nome}`, categoria: 'outros'
                });
                await db.objetivos.update(id, { guardado: c.guardado - valor });
                this.toast(`Resgatado ${this.formatarMoeda(valor)} de ${nome}`);
                await this.init();
            } else {
                this.toast('Valor inválido.', 'error');
            }
        }
    }

    // ============================
    // EXPORTAR / IMPORTAR JSON
    // ============================
    async exportarJSON() {
        const dados = {
            versao: CONFIG.VERSAO_DB,
            exportado_em: new Date().toISOString(),
            transacoes: await db.transacoes.toArray(),
            objetivos: await db.objetivos.toArray()
        };
        const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `backup-financeiro-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.toast('Backup baixado!');
    }

    async importarJSON(input) {
        const file = input.files[0];
        if (!file) return;
        
        try {
            const texto = await file.text();
            const dados = JSON.parse(texto);
            
            if (!dados.transacoes || !dados.objetivos) throw new Error('Arquivo inválido');

            if (await this.showModal("Importar Backup", "<p>Isso <b>substituirá</b> todos os dados atuais. Continuar?</p>")) {
                await db.transacoes.clear();
                await db.objetivos.clear();
                
                // Remove IDs para auto-incremento funcionar
                const trans = dados.transacoes.map(({id, ...rest}) => rest);
                const objs = dados.objetivos.map(({id, ...rest}) => rest);
                
                if (trans.length) await db.transacoes.bulkAdd(trans);
                if (objs.length) await db.objetivos.bulkAdd(objs);
                
                this.toast('Dados restaurados!');
                await this.init();
            }
        } catch (e) {
            this.toast('Erro ao importar: ' + e.message, 'error');
        }
        input.value = '';
    }

    // ============================
    // BACKUP NUVEM (SheetDB)
    // ============================
    async sincronizarPlanilha(acao) {
        if (!CONFIG.SHEETDB_URL || CONFIG.SHEETDB_URL.includes('SUA_CHAVE')) {
            this.showModal("Configurar Nuvem", `<p>Edite o arquivo <code>app.js</code> e insira sua URL do SheetDB na constante <b>CONFIG.SHEETDB_URL</b>.</p>`, true);
            return;
        }

        if (acao === 'enviar') {
            const transacoes = await db.transacoes.toArray();
            const objetivos = await db.objetivos.toArray();
            
            if (transacoes.length === 0 && objetivos.length === 0) {
                this.toast('Nada para enviar.', 'error');
                return;
            }

            if (!await this.showModal("Backup", "<p>Enviar dados para a nuvem?</p>")) return;

            try {
                // Limpa e envia transações
                await fetch(`${CONFIG.SHEETDB_URL}/all`, { method: 'DELETE' }).catch(()=>{});
                if (transacoes.length) {
                    await fetch(CONFIG.SHEETDB_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ data: transacoes.map(t => ({
                            id: t.id, tipo: t.tipo, valor: t.valor,
                            data: t.data, descricao: t.descricao, categoria: t.categoria
                        }))})
                    });
                }

                // Limpa e envia objetivos
                await fetch(`${CONFIG.SHEETDB_URL}/all?sheet=Objetivos`, { method: 'DELETE' }).catch(()=>{});
                if (objetivos.length) {
                    await fetch(`${CONFIG.SHEETDB_URL}?sheet=Objetivos`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ data: objetivos.map(o => ({
                            id: o.id, nome: o.nome, meta: o.meta,
                            guardado: o.guardado, valorMensal: o.valorMensal
                        }))})
                    });
                }

                this.toast('Backup enviado com sucesso!');
            } catch (e) {
                this.toast('Falha no envio.', 'error');
                console.error(e);
            }

        } else if (acao === 'restaurar') {
            if (!await this.showModal("Restaurar", "<p>Isso substituirá os dados locais pelos da nuvem. Continuar?</p>")) return;

            try {
                const [resTrans, resObj] = await Promise.all([
                    fetch(CONFIG.SHEETDB_URL).then(r => r.json()),
                    fetch(`${CONFIG.SHEETDB_URL}?sheet=Objetivos`).then(r => r.json())
                ]);

                await db.transacoes.clear();
                await db.objetivos.clear();

                if (resTrans.length) {
                    const trans = resTrans.map(({id, ...r}) => ({...r, valor: parseFloat(r.valor)}));
                    await db.transacoes.bulkAdd(trans);
                }
                if (resObj.length) {
                    const objs = resObj.map(({id, ...r}) => ({
                        ...r, meta: parseFloat(r.meta), guardado: parseFloat(r.guardado), valorMensal: parseFloat(r.valorMensal)
                    }));
                    await db.objetivos.bulkAdd(objs);
                }

                this.toast('Dados restaurados da nuvem!');
                await this.init();
            } catch (e) {
                this.toast('Falha na restauração.', 'error');
                console.error(e);
            }
        }
    }
}

// Inicializa
const app = new AppFinanceiro();