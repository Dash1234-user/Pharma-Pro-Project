import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import client from '../api/client';

const fetchCategories = () => client.get('/categories').then(r => r.data);
const fetchProducts   = () => client.get('/products').then(r => r.data);
const fetchAnalysis   = () => client.get('/analysis?days=365').then(r => r.data);

export default function CategoriesPage() {
  const qc = useQueryClient();

  // Form state
  const [name,   setName]   = useState('');
  const [desc,   setDesc]   = useState('');
  const [editId, setEditId] = useState('');
  const [error,  setError]  = useState('');

  const { data: categories = [], isLoading } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });
  const { data: products   = [] }            = useQuery({ queryKey: ['products'],   queryFn: fetchProducts   });
  const { data: analysis   = {} }            = useQuery({ queryKey: ['analysis', 365], queryFn: fetchAnalysis, staleTime: 120_000 });

  // Product count per category
  const countMap = {};
  products.forEach(p => { countMap[p.category] = (countMap[p.category] || 0) + 1; });

  // Revenue per category from /api/analysis — mirrors catRev in app.js
  const catRevMap = {};
  (analysis.categorySales || []).forEach(c => { catRevMap[c.name] = c.revenue; });
  const totalRev = Object.values(catRevMap).reduce((s, v) => s + v, 0);

  function resetForm() { setName(''); setDesc(''); setEditId(''); setError(''); }

  const saveMutation = useMutation({
    mutationFn: (payload) => editId
      ? client.put(`/categories/${editId}`, payload)
      : client.post('/categories', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      resetForm();
    },
    onError: (e) => setError(e.response?.data?.error || 'Save failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => client.delete(`/categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
    onError: (e) => setError(e.response?.data?.error || 'Delete failed'),
  });

  function handleSave() {
    setError('');
    if (!name.trim()) { setError('Category name is required'); return; }
    saveMutation.mutate({ name: name.trim(), desc: desc.trim() });
  }

  function handleEdit(cat) {
    setName(cat.name);
    setDesc(cat.desc || '');
    setEditId(cat.id);
    setError('');
    document.getElementById('cat-name-input')?.focus();
  }

  function handleDelete(cat) {
    const count = countMap[cat.id] || 0;
    if (count > 0) { setError(`Cannot delete: ${count} medicine(s) use this category`); return; }
    if (!window.confirm('Delete this category?')) return;
    deleteMutation.mutate(cat.id);
  }

  return (
    <div style={{ padding:'20px 24px', display:'grid', gridTemplateColumns:'1fr 340px', gap:20, alignItems:'start' }}>

      {/* ── LEFT: Manage Categories ────────────────────────────────────── */}
      <div className="card" style={{ padding:'20px' }}>
        <h3 style={{ fontSize:16, fontWeight:800, color:'var(--text)', margin:'0 0 16px' }}>
          Manage Categories
        </h3>

        {/* Form */}
        <div className="form-group" style={{ marginBottom:12 }}>
          <label className="form-label">CATEGORY NAME *</label>
          <input id="cat-name-input" className="form-input" type="text"
            placeholder="e.g. Tablets, Syrups…"
            value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()} />
        </div>
        <div className="form-group" style={{ marginBottom:12 }}>
          <label className="form-label">DESCRIPTION</label>
          <input className="form-input" type="text"
            placeholder="Optional description"
            value={desc} onChange={e => setDesc(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()} />
        </div>
        {error && <div style={{ color:'#ef4444', fontSize:13, fontWeight:600, marginBottom:8 }}>{error}</div>}
        <div style={{ display:'flex', gap:8, marginBottom:20 }}>
          <button className="btn-primary" style={{ flex:1, justifyContent:'center' }}
            onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving…' : editId ? 'Update Category' : 'Save Category'}
          </button>
          {editId && (
            <button className="btn-outline" onClick={resetForm}>Cancel</button>
          )}
        </div>

        {/* Category list */}
        {isLoading ? (
          <div style={{ textAlign:'center', color:'#94a3b8', padding:20 }}>Loading…</div>
        ) : categories.length === 0 ? (
          <div style={{ textAlign:'center', color:'#94a3b8', fontStyle:'italic', padding:20 }}>
            No categories yet
          </div>
        ) : (
          <div id="categories-list" style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {categories.map(cat => {
              const count = countMap[cat.id] || 0;
              return (
                <div key={cat.id} className="cat-item">
                  <div style={{ flex:1, minWidth:0 }}>
                    <div className="cat-item-name">{cat.name}</div>
                    {cat.desc && <div className="cat-item-desc">{cat.desc}</div>}
                    <div style={{ fontSize:11, color:'#94a3b8', marginTop:2 }}>
                      {count} medicine{count !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                    <button className="btn-icon" onClick={() => handleEdit(cat)}>✏️</button>
                    <button className="btn-icon" onClick={() => handleDelete(cat)}
                      disabled={deleteMutation.isPending}>🗑️</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── RIGHT: Category Stats ──────────────────────────────────────── */}
      <div className="card" style={{ padding:'20px' }}>
        <h3 style={{ fontSize:16, fontWeight:800, color:'var(--text)', margin:'0 0 16px' }}>
          Category Stats
        </h3>

        {categories.length === 0 ? (
          <div style={{ textAlign:'center', color:'#94a3b8', fontStyle:'italic', padding:20 }}>
            No categories yet
          </div>
        ) : (
          <div id="cat-stats" style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {categories
              .sort((a, b) => (catRevMap[b.name] || 0) - (catRevMap[a.name] || 0))
              .map(cat => {
                const rev  = catRevMap[cat.name] || 0;
                const cnt  = countMap[cat.id]    || 0;
                const pct  = totalRev > 0 ? ((rev / totalRev) * 100).toFixed(1) : '0';
                return (
                  <div key={cat.id} style={{ padding:'12px', background:'#f8fafc', borderRadius:10, border:'1px solid var(--border)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                      <div style={{ fontWeight:600, fontSize:13.5 }}>{cat.name}</div>
                      <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, color:'var(--accent)', fontWeight:700 }}>
                        ₹{parseFloat(rev).toFixed(2)}
                      </div>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#94a3b8', marginBottom:6 }}>
                      <span>{cnt} medicines</span>
                      <span>{pct}% of revenue</span>
                    </div>
                    <div style={{ background:'#e2e8f0', borderRadius:99, height:5 }}>
                      <div style={{ width:`${pct}%`, background:'linear-gradient(90deg,#0ea5e9,#38bdf8)', height:5, borderRadius:99, transition:'width .4s' }} />
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

    </div>
  );
}
