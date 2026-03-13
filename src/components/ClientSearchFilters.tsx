import { useState, useEffect } from 'react';
import { Search, SlidersHorizontal, X, Building2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationFilters, FilterValues } from '@/hooks/useOrganizationFilters';

interface Tag {
  id: string;
  name: string;
  color: string;
}

/**
 * Icon from organization_icons table.
 * Prepared for future icon_key migration: today we use `icon` (emoji) for both
 * display and filtering. In the future, `icon_key` will be the stable identifier
 * and `icon` will be display-only.
 */
interface OrganizationIcon {
  id: string;
  icon: string;       // emoji for display (and current filter key)
  label: string | null;
  // Future: icon_key: string — stable identifier for filtering
}

const DEFAULT_ICONS: OrganizationIcon[] = [
  { id: 'default-1', icon: '💬', label: 'Mensagem' },
  { id: 'default-2', icon: '📅', label: 'Agendamento' },
  { id: 'default-3', icon: '📄', label: 'Documento' },
  { id: 'default-4', icon: '📞', label: 'Ligação' },
  { id: 'default-5', icon: '✅', label: 'Concluído' },
  { id: 'default-6', icon: '🤝', label: 'Acordo' },
  { id: 'default-7', icon: '⚠️', label: 'Alerta' },
  { id: 'default-8', icon: '🧰', label: 'Técnico' },
];

interface ClientSearchFiltersProps {
  onFilterChange: (filters: FilterValues) => void;
  organizationId: string | null;
  pageName: string;
  filiais?: [string, string][];
}

export const ClientSearchFilters = ({ onFilterChange, organizationId, pageName, filiais = [] }: ClientSearchFiltersProps) => {
  const { filters, updateFilters, isLoading } = useOrganizationFilters(pageName);
  const [tags, setTags] = useState<Tag[]>([]);
  const [orgIcons, setOrgIcons] = useState<OrganizationIcon[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (organizationId) {
      loadTags();
      loadOrganizationIcons();
    }
  }, [organizationId]);

  useEffect(() => {
    if (isLoading) return;

    const timer = setTimeout(() => {
      onFilterChange(filters);
    }, 400);

    return () => clearTimeout(timer);
  }, [filters, isLoading, onFilterChange]);

  const loadTags = async () => {
    if (!organizationId) return;

    const { data, error } = await supabase
      .from('tags')
      .select('*')
      .eq('organization_id', organizationId)
      .order('name');

    if (!error && data) {
      setTags(data);
    }
  };

  const loadOrganizationIcons = async () => {
    if (!organizationId) return;

    const { data, error } = await supabase
      .from('organization_icons')
      .select('id, icon, label')
      .eq('organization_id', organizationId)
      .order('created_at');

    if (!error && data && data.length > 0) {
      setOrgIcons(data.map(d => ({
        id: d.id,
        icon: d.icon,
        label: d.label,
      })));
    } else {
      // Fallback: use default icons if org has none configured
      setOrgIcons(DEFAULT_ICONS);
    }
  };

  const applyFilters = (newFilters: Partial<FilterValues>) => {
    const updatedFilters = { ...filters, ...newFilters };
    updateFilters(updatedFilters);
  };

  const clearFilters = () => {
    updateFilters({
      searchTerm: '',
      statusFilter: 'all',
      filialFilter: 'all',
      tagsFilter: [],
      dateFrom: '',
      dateTo: '',
      updateDateFrom: '',
      updateDateTo: '',
      boletoFilter: 'all',
      timelineFilter: 'all',
      iconsFilter: [],
    });
  };

  const toggleTag = (tagId: string) => {
    const newTagsFilter = filters.tagsFilter.includes(tagId)
      ? filters.tagsFilter.filter(id => id !== tagId)
      : [...filters.tagsFilter, tagId];
    applyFilters({ tagsFilter: newTagsFilter });
  };

  const toggleIcon = (iconEmoji: string) => {
    // Currently filtering by emoji value. Future: filter by icon_key
    const newIconsFilter = filters.iconsFilter.includes(iconEmoji)
      ? filters.iconsFilter.filter(i => i !== iconEmoji)
      : [...filters.iconsFilter, iconEmoji];
    applyFilters({ iconsFilter: newIconsFilter });
  };

  const activeFiltersCount = [
    filters.statusFilter !== 'all',
    filters.filialFilter !== 'all',
    filters.tagsFilter.length > 0,
    filters.dateFrom || filters.dateTo,
    filters.updateDateFrom || filters.updateDateTo,
    filters.boletoFilter !== 'all',
    filters.timelineFilter !== 'all',
    filters.iconsFilter.length > 0,
  ].filter(Boolean).length;

  return (
    <div className="space-y-4 mb-6">
      {/* Search Bar + Filial Selector */}
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Buscar por nome ou ID do cliente..."
            value={filters.searchTerm}
            onChange={(e) => {
              applyFilters({ searchTerm: e.target.value });
            }}
            className="pl-10 pr-10 flex-1"
          />
          {filters.searchTerm && (
            <X
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4 cursor-pointer hover:text-foreground transition-colors"
              onClick={() => applyFilters({ searchTerm: '' })}
            />
          )}
        </div>

        {filiais.length > 0 && (
          <Select value={filters.filialFilter} onValueChange={(value) => applyFilters({ filialFilter: value })}>
            <SelectTrigger className="w-[220px] h-9 shrink-0">
              <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Todas filiais" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas filiais</SelectItem>
              {filiais.map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Popover open={showFilters} onOpenChange={setShowFilters}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="relative shrink-0">
              <SlidersHorizontal className="w-4 h-4 mr-2" />
              Filtros
              {activeFiltersCount > 0 && (
                <Badge className="ml-2 bg-primary text-primary-foreground px-1.5 py-0.5 text-xs">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[400px]" align="end">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Filtros Avançados</h4>
                {activeFiltersCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="text-xs"
                  >
                    <X className="w-3 h-3 mr-1" />
                    Limpar
                  </Button>
                )}
              </div>

              {/* Status */}
              <div>
                <label className="text-sm font-medium mb-2 block">Status</label>
                <Select value={filters.statusFilter} onValueChange={(value) => applyFilters({ statusFilter: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="active">Ativos</SelectItem>
                    <SelectItem value="blocked">Bloqueados</SelectItem>
                    <SelectItem value="overdue">Vencidos</SelectItem>
                    <SelectItem value="inactive">Inativos</SelectItem>
                    <SelectItem value="completed">Finalizados</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Tags */}
              {tags.length > 0 && (
                <div>
                  <label className="text-sm font-medium mb-2 block">Tags</label>
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                    {tags.map(tag => (
                      <Badge
                        key={tag.id}
                        style={{
                          backgroundColor: filters.tagsFilter.includes(tag.id) ? tag.color : 'transparent',
                          borderColor: tag.color,
                          color: filters.tagsFilter.includes(tag.id) ? 'white' : tag.color
                        }}
                        className="cursor-pointer border-2 transition-all hover:scale-105"
                        onClick={() => toggleTag(tag.id)}
                      >
                        {tag.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Period */}
              <div>
                <label className="text-sm font-medium mb-2 block">Período de Cadastro</label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Input
                      type="date"
                      value={filters.dateFrom}
                      onChange={(e) => applyFilters({ dateFrom: e.target.value })}
                      placeholder="De"
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <Input
                      type="date"
                      value={filters.dateTo}
                      onChange={(e) => applyFilters({ dateTo: e.target.value })}
                      placeholder="Até"
                      className="text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Data de Atualização */}
              <div>
                <label className="text-sm font-medium mb-2 block">Data de Atualização</label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Input
                      type="date"
                      value={filters.updateDateFrom}
                      onChange={(e) => applyFilters({ updateDateFrom: e.target.value })}
                      placeholder="De"
                      className="text-sm"
                    />
                  </div>
                  <div>
                    <Input
                      type="date"
                      value={filters.updateDateTo}
                      onChange={(e) => applyFilters({ updateDateTo: e.target.value })}
                      placeholder="Até"
                      className="text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Boletos */}
              <div>
                <label className="text-sm font-medium mb-2 block">Boletos</label>
                <Select value={filters.boletoFilter} onValueChange={(value) => applyFilters({ boletoFilter: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="pending">Com boletos pendentes</SelectItem>
                    <SelectItem value="paid">Com boletos pagos</SelectItem>
                    <SelectItem value="none">Sem boletos</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Timeline */}
              <div>
                <label className="text-sm font-medium mb-2 block">Timeline</label>
                <Select value={filters.timelineFilter} onValueChange={(value) => applyFilters({ timelineFilter: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="with_events">Com eventos</SelectItem>
                    <SelectItem value="no_events">Sem eventos</SelectItem>
                    <SelectItem value="with_analysis">Com análise de risco</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Icons Filter - Dynamic from organization_icons */}
              <div>
                <label className="text-sm font-medium mb-2 block">Ícones</label>
                <div className="flex flex-wrap gap-2">
                  {orgIcons.map(orgIcon => (
                    <button
                      key={orgIcon.id}
                      onClick={() => toggleIcon(orgIcon.icon)}
                      title={orgIcon.label || orgIcon.icon}
                      className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-all hover:scale-110 ${
                        filters.iconsFilter.includes(orgIcon.icon)
                          ? 'bg-primary text-primary-foreground shadow-lg'
                          : 'bg-muted hover:bg-muted/80'
                      }`}
                    >
                      {orgIcon.icon}
                    </button>
                  ))}
                </div>
              </div>

              {/* Close Button */}
              <Button onClick={() => setShowFilters(false)} className="w-full">
                Fechar
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Active Filters Display */}
      {activeFiltersCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.statusFilter !== 'all' && (
            <Badge variant="secondary" className="gap-1">
              Status: {
                filters.statusFilter === 'active' ? 'Ativos' :
                filters.statusFilter === 'blocked' ? 'Bloqueados' :
                filters.statusFilter === 'overdue' ? 'Vencidos' :
                filters.statusFilter === 'inactive' ? 'Inativos' :
                filters.statusFilter === 'completed' ? 'Finalizados' : filters.statusFilter
              }
              <X
                className="w-3 h-3 cursor-pointer"
                onClick={() => applyFilters({ statusFilter: 'all' })}
              />
            </Badge>
          )}
          {filters.filialFilter !== 'all' && (
            <Badge variant="secondary" className="gap-1">
              Filial: {filiais.find(([id]) => id === filters.filialFilter)?.[1] || filters.filialFilter}
              <X
                className="w-3 h-3 cursor-pointer"
                onClick={() => applyFilters({ filialFilter: 'all' })}
              />
            </Badge>
          )}
          {filters.tagsFilter.length > 0 && (
            <Badge variant="secondary" className="gap-1">
              {filters.tagsFilter.length} tag(s)
              <X
                className="w-3 h-3 cursor-pointer"
                onClick={() => applyFilters({ tagsFilter: [] })}
              />
            </Badge>
          )}
          {(filters.dateFrom || filters.dateTo) && (
            <Badge variant="secondary" className="gap-1">
              Cadastro: {filters.dateFrom || '...'} até {filters.dateTo || '...'}
              <X
                className="w-3 h-3 cursor-pointer"
                onClick={() => applyFilters({ dateFrom: '', dateTo: '' })}
              />
            </Badge>
          )}
          {(filters.updateDateFrom || filters.updateDateTo) && (
            <Badge variant="secondary" className="gap-1">
              Atualização: {filters.updateDateFrom || '...'} até {filters.updateDateTo || '...'}
              <X
                className="w-3 h-3 cursor-pointer"
                onClick={() => applyFilters({ updateDateFrom: '', updateDateTo: '' })}
              />
            </Badge>
          )}
          {filters.boletoFilter !== 'all' && (
            <Badge variant="secondary" className="gap-1">
              Boletos
              <X
                className="w-3 h-3 cursor-pointer"
                onClick={() => applyFilters({ boletoFilter: 'all' })}
              />
            </Badge>
          )}
          {filters.timelineFilter !== 'all' && (
            <Badge variant="secondary" className="gap-1">
              Timeline
              <X
                className="w-3 h-3 cursor-pointer"
                onClick={() => applyFilters({ timelineFilter: 'all' })}
              />
            </Badge>
          )}
          {filters.iconsFilter.length > 0 && (
            <Badge variant="secondary" className="gap-1 flex items-center">
              <span className="flex items-center gap-1">
                {filters.iconsFilter.map(icon => (
                  <span key={icon}>{icon}</span>
                ))}
              </span>
              <X
                className="w-3 h-3 cursor-pointer ml-1"
                onClick={() => applyFilters({ iconsFilter: [] })}
              />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
};
