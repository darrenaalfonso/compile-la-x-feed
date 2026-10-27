import unittest
from urllib.parse import unquote
from scripts.fetch_feed import authorization, make_feed
AUTHOR = {'id':'123','username':'compilela','name':'Compile LA','protected':False}
POST = {'id':'200','text':'Hello <script>alert(1)</script>','created_at':'2026-10-27T14:23:00Z'}
class FeedTests(unittest.TestCase):
    def run_feed(self, timeline=None, author=None):
        calls = []
        def get(path, params):
            calls.append((path, params))
            return {'data': author if author is not None else AUTHOR} if path == 'users/me' else timeline
        return make_feed(get, '2026-10-27T14:23:00Z'), calls
    def test_latest_five(self):
        feed, calls = self.run_feed({'data':[{**POST,'id':str(i)} for i in range(200,207)]})
        self.assertEqual([p['id'] for p in feed['posts']], ['206','205','204','203','202'])
        self.assertEqual(calls[1][1]['max_results'], '5')
        self.assertNotIn('expansions', calls[1][1])
    def test_empty_clears(self):
        self.assertEqual(self.run_feed({'meta':{'result_count':0}})[0]['posts'], [])
    def test_malformed_rejected(self):
        with self.assertRaises(RuntimeError): self.run_feed({})
    def test_protected(self):
        feed,calls = self.run_feed(author={**AUTHOR,'protected':True})
        self.assertEqual(feed['posts'], []); self.assertEqual(len(calls),1)
    def test_wrong_account(self):
        with self.assertRaises(RuntimeError): self.run_feed(author={**AUTHOR,'username':'another'})
    def test_missing_visibility(self):
        with self.assertRaises(RuntimeError): self.run_feed(author={'id':'123','username':'compilela'})
    def test_filtered(self):
        feed,_ = self.run_feed({'data':[POST,POST,{**POST,'id':'201','possibly_sensitive':True},{**POST,'id':'202','withheld':{'country_codes':['US']}}]})
        self.assertEqual(len(feed['posts']),1)
    def test_full_text_edits(self):
        feed,_ = self.run_feed({'data':[{**POST,'note_post':{'text':'Full long post'},'edit_history_post_ids':['199','200']}]})
        self.assertEqual(feed['posts'][0]['text'],'Full long post'); self.assertTrue(feed['posts'][0]['edited'])
    def test_text_unmodified(self):
        self.assertEqual(self.run_feed({'data':[POST]})[0]['posts'][0]['text'],POST['text'])
    def test_oauth_known_vector(self):
        result = authorization('http://photos.example.net/photos',{'file':'vacation.jpg','size':'original'},('dpf43f3p2l4k3l03','kd94hf93k423kf44','nnch734d00sl2jdk','pfkkdhi9sl3r4s00'),'kllo9940pd9333jh',1191242096)
        self.assertIn('oauth_signature="tR3+Ty81lMeYAr/Fid0kMTYa/WM="',unquote(result))
if __name__ == '__main__': unittest.main()
