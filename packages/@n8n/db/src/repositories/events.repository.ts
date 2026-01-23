import { Service } from '@n8n/di';
import { DataSource, Repository } from '@n8n/typeorm';

import { EventEntity } from '../entities';

@Service()
export class EventRepository extends Repository<EventEntity> {
	constructor(dataSource: DataSource) {
		super(EventEntity, dataSource.manager);
	}
}
