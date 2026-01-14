import React from 'react';
import { Menu, QrCode, X } from 'lucide-react';
import { StockItem, AdminNotice, User } from '../types';
import NotificationPanel from './NotificationPanel';

interface GlobalHeaderProps {
  currentPage: string;
  onMenuClick: () => void;
  lowStockItems: StockItem[];
  setCurrentPage: (page: string) => void;
  bannerNotice?: AdminNotice;
  isAutoBipagemActive: boolean;
  onToggleAutoBipagem: (isActive: boolean) => void;
  onDismissNotice: (id: string) => void;
  currentUser: User | null;
}

const getPageTitle = (page: string): string => {
    const titles: { [key: string]: string } = {
        'dashboard': 'Dashboard',
        'importer': 'Importação de Pedidos',
        'bipagem': 'Bipagem Automática',
        'pedidos': 'Gerenciamento de Pedidos',
        'pesagem': 'Controle de Pesagem',
        'estoque': 'Gerenciamento de Estoque',
        'funcionarios': 'Controle de Funcionários',
        'relatorios': 'Relatórios e Análises',
        'etiquetas': 'Gerador de Etiquetas ZPL',
        'passo-a-passo': 'Passo a Passo',
        'ajuda': 'Central de Ajuda',
        'configuracoes': 'Configurações de Usuários',
        'configuracoes-gerais': 'Configurações Gerais'
    };
    return titles[page] || 'ERP Fábrica Pro';
};

const NoticeBanner: React.FC<{ notice: AdminNotice; onDismiss: (id: string) => void; canDismiss: boolean }> = ({ notice, onDismiss, canDismiss }) => {
    const levelClasses = {
        green: 'bg-green-600 text-white',
        yellow: 'bg-yellow-500 text-black',
        red: 'bg-red-600 text-white',
    };
    return (
        <div className={`relative w-full p-1 text-sm font-semibold overflow-hidden whitespace-nowrap ${levelClasses[notice.level]}`}>
            <div className={`inline-block animate-marquee ${canDismiss ? 'pr-10' : ''}`}>
                {notice.text} - (Aviso de {notice.createdBy})
            </div>
            {canDismiss && (
                <button
                    onClick={() => onDismiss(notice.id)}
                    className="absolute top-1/2 right-2 transform -translate-y-1/2 p-1 rounded-full hover:bg-black/20"
                    aria-label="Dispensar aviso"
                >
                    <X size={16} />
                </button>
            )}
        </div>
    );
};


const GlobalHeader: React.FC<GlobalHeaderProps> = ({ currentPage, onMenuClick, lowStockItems, setCurrentPage, bannerNotice, isAutoBipagemActive, onToggleAutoBipagem, currentUser, onDismissNotice }) => {
  
  const headerContainerClasses = `flex-shrink-0 bg-[var(--color-surface)]`;

  const headerClasses = `flex items-center justify-between p-4 border-b border-[var(--color-border)] text-[var(--color-text-primary)]`;
  
  const canDismissBanner = !!currentUser && (currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'ADMIN');

  return (
    <header className={headerContainerClasses}>
      {bannerNotice && <NoticeBanner notice={bannerNotice} onDismiss={onDismissNotice} canDismiss={canDismissBanner} />}
      <div className={headerClasses}>
        <div className="flex items-center gap-4">
          <button onClick={onMenuClick} className="p-2 -ml-2 md:hidden">
              <Menu size={24} />
          </button>
          <h1 className="text-lg md:text-xl font-bold">{getPageTitle(currentPage)}</h1>
        </div>
        
        <div className="flex items-center gap-4">
          <button
              onClick={() => onToggleAutoBipagem(!isAutoBipagemActive)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all ${
                  isAutoBipagemActive 
                  ? 'bg-blue-600 text-white border-blue-700 shadow-md animate-pulse' 
                  : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
              }`}
              title={isAutoBipagemActive ? "Desativar Auto Bipagem" : "Ativar Auto Bipagem"}
          >
              <QrCode size={16} />
              <span className="hidden sm:inline">Auto Bipagem</span>
          </button>
          <NotificationPanel lowStockItems={lowStockItems} onNavigate={setCurrentPage} />
        </div>
      </div>
    </header>
  );
};

export default GlobalHeader;