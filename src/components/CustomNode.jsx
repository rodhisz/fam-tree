import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Heart, User } from 'lucide-react';

// Avatar anggota keluarga: thumbnail ringan untuk pohon, foto asli fallback.
const Avatar = ({ data }) => {
    const photoSrc = data.thumbnail || data.photo;
    const hasPhoto = photoSrc && !photoSrc.includes('unsplash.com');

    if (hasPhoto) {
        return (
            <button
                type="button"
                className="node-avatar-btn"
                onClick={(e) => {
                    e.stopPropagation();
                    if (data.onPreviewPhoto) data.onPreviewPhoto(data);
                }}
                title={data.photo ? `Lihat foto ${data.name}` : data.name}
                aria-label={`Lihat foto ${data.name}`}
            >
                <img src={photoSrc} alt={data.name} className="node-avatar" width={48} height={48} loading="lazy" />
            </button>
        );
    }

    return (
        <div className={`node-avatar placeholder ${data.gender}`}>
            <User size={22} aria-hidden="true" />
        </div>
    );
};

const FamilyMemberNode = ({ data }) => {
    const isDeceased = !!data.death;

    return (
        <div className={`family-node ${data.gender} ${isDeceased ? 'deceased' : ''}`}>
            {/* Handle garis keturunan */}
            <Handle type="target" position={Position.Top} id="top" style={{ background: 'var(--edge)' }} />

            {/* Handle samping untuk pasangan dan union */}
            <Handle type="target" position={Position.Left} id="left-target" style={{ left: 0, opacity: 0 }} />
            <Handle type="source" position={Position.Left} id="left-source" style={{ left: 0, opacity: 0 }} />

            <Handle type="target" position={Position.Right} id="right-target" style={{ right: 0, opacity: 0 }} />
            <Handle type="source" position={Position.Right} id="right-source" style={{ right: 0, opacity: 0 }} />

            <div className="node-content">
                <Avatar data={data} />
                <div className="node-info">
                    <div className="node-name">{data.name}</div>
                    <div className="node-dates">
                        {data.birth && !isNaN(new Date(data.birth).getFullYear()) ? new Date(data.birth).getFullYear() : '?'}
                        {data.death && !isNaN(new Date(data.death).getFullYear()) ? ` - ${new Date(data.death).getFullYear()}` : ''}
                    </div>
                </div>
            </div>

            <div className="spouse-indicators">
                {data.spouses?.map((s, idx) => (
                    <div
                        key={idx}
                        className={`spouse-dot ${s.type || 'married'}`}
                        title={s.type === 'divorced' ? 'Bercerai' : 'Menikah'}
                    >
                        <Heart size={9} fill={s.type === 'divorced' ? 'transparent' : 'currentColor'} aria-hidden="true" />
                    </div>
                ))}
            </div>

            <Handle type="source" position={Position.Bottom} id="bottom" style={{ background: 'var(--edge)' }} />
        </div>
    );
};

export default memo(FamilyMemberNode);
