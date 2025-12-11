import { Column, Entity, Index, PrimaryColumn } from '@n8n/typeorm';

@Entity()
export class EventEntity {
	@Index()
	@PrimaryColumn()
	path: string;

	@Column({ type: 'jsonb' })
	usages: Record<string, string[]>;
}
