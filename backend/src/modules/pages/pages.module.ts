import { Module } from '@nestjs/common';
import { AdminPagesController } from './admin-pages.controller';
import { PagesService } from './pages.service';
import { PublicPagesController } from './public-pages.controller';

@Module({
  controllers: [AdminPagesController, PublicPagesController],
  providers: [PagesService],
})
export class PagesModule {}
