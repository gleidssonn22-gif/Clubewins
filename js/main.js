// Lista de dicas e estratégias dinâmicas para o gerador interativo
const dicasEstrategias = [
    "💡 Dica VIP: Sempre analise o histórico dos últimos 5 confrontos antes de definir sua estratégia principal.",
    "🚀 Gestão de Banca: Nunca arrisque mais do que 2% a 5% do seu capital total em uma única operação.",
    "📊 Foco em Estatísticas: Dados de posse de bola e finalizações no alvo pesam muito mais do que palpites isolados.",
    "⭐ Comunidade: Compartilhe seus resultados diários no grupo VIP para ganhar insights exclusivos de outros membros.",
    "🔥 Oportunidade do Dia: Monitore jogos com alta oscilação de mercado para encontrar odds de valor superior."
];

function gerarDica() {
    const randomIndex = Math.floor(Math.random() * dicasEstrategias.length);
    const displayElement = document.getElementById("tip-display");
    
    // Efeito simples de transição
    displayElement.style.opacity = 0;
    setTimeout(() => {
        displayElement.textContent = dicasEstrategias[randomIndex];
        displayElement.style.opacity = 1;
    }, 200);
}

// Inicializa a transição suave no CSS
document.getElementById("tip-display").style.transition = "opacity 0.2s ease-in-out";