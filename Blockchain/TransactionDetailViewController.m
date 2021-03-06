//
//  TransactionDetailViewController.m
//  Blockchain
//
//  Created by Kevin Wu on 8/23/16.
//  Copyright © 2016 Blockchain Luxembourg S.A. All rights reserved.
//

#import "TransactionDetailViewController.h"
#import "TransactionDetailTableCell.h"
#import "NSNumberFormatter+Currencies.h"
#import "RootService.h"
#import "TransactionDetailNavigationController.h"
#import "BCWebViewController.h"
#import "TransactionRecipientsViewController.h"

#ifdef DEBUG
#import "UITextView+AssertionFailureFix.h"
#endif

const int cellRowValue = 0;
const int cellRowDescription = 1;
const int cellRowTo = 2;
const int cellRowFrom = 3;
const int cellRowDate = 4;
const int cellRowStatus = 5;

const CGFloat rowHeightDefault = 60;
const CGFloat rowHeightValue = 116;

@interface TransactionDetailViewController () <UITableViewDelegate, UITableViewDataSource, UITextViewDelegate, DetailDelegate, RecipientsDelegate>

@property (nonatomic) UITableView *tableView;
@property (nonatomic) UITextView *textView;
@property CGFloat oldTextViewHeight;
@property (nonatomic) UIView *descriptonInputAccessoryView;
@property (nonatomic) UIRefreshControl *refreshControl;
@property (nonatomic) BOOL isGettingFiatAtTime;

@end
@implementation TransactionDetailViewController

- (void)viewDidLoad
{
    [super viewDidLoad];
    self.view.backgroundColor = [UIColor whiteColor];
    self.tableView = [[UITableView alloc] initWithFrame:self.view.frame style:UITableViewStylePlain];
    [self.view addSubview:self.tableView];
    self.tableView.delegate = self;
    self.tableView.dataSource = self;
    [self.tableView registerClass:[TransactionDetailTableCell class] forCellReuseIdentifier:CELL_IDENTIFIER_TRANSACTION_DETAIL];
    self.tableView.tableFooterView = [UIView new];
    
    [self setupPullToRefresh];
    [self setupTextViewInputAccessoryView];

    if (![self.transaction.fiatAmountsAtTime objectForKey:[self getCurrencyCode]]) {
        [self getFiatAtTime];
    }
}

- (void)viewDidAppear:(BOOL)animated
{
    [super viewDidAppear:animated];
    
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(didGetHistory) name:NOTIFICATION_KEY_RELOAD_TRANSACTION_DETAIL object:nil];
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(reloadSymbols) name:NOTIFICATION_KEY_RELOAD_SYMBOLS object:nil];
}

- (void)viewDidDisappear:(BOOL)animated
{
    [super viewDidDisappear:animated];
    
    [[NSNotificationCenter defaultCenter] removeObserver:self name:NOTIFICATION_KEY_RELOAD_TRANSACTION_DETAIL object:nil];
    [[NSNotificationCenter defaultCenter] removeObserver:self name:NOTIFICATION_KEY_RELOAD_SYMBOLS object:nil];
}

- (void)setupTextViewInputAccessoryView
{
    UIView *inputAccessoryView = [[UIView alloc] initWithFrame:CGRectMake(0, 0, self.view.frame.size.width, BUTTON_HEIGHT)];
    inputAccessoryView.backgroundColor = [UIColor redColor];
    
    UIButton *updateButton = [[UIButton alloc] initWithFrame:CGRectMake(0, 0, self.view.frame.size.width, BUTTON_HEIGHT)];
    updateButton.backgroundColor = COLOR_BUTTON_GREEN;
    [updateButton setTitleColor:[UIColor whiteColor] forState:UIControlStateNormal];
    [updateButton setTitle:BC_STRING_UPDATE forState:UIControlStateNormal];
    [updateButton addTarget:self action:@selector(saveNote) forControlEvents:UIControlEventTouchUpInside];
    [inputAccessoryView addSubview:updateButton];
    
    UIButton *cancelButton = [[UIButton alloc] initWithFrame:CGRectMake(updateButton.frame.size.width - 50, 0, 50, BUTTON_HEIGHT)];
    cancelButton.backgroundColor = COLOR_BUTTON_GRAY_CANCEL;
    [cancelButton setImage:[UIImage imageNamed:@"cancel"] forState:UIControlStateNormal];
    [cancelButton addTarget:self action:@selector(endEditing) forControlEvents:UIControlEventTouchUpInside];
    [inputAccessoryView addSubview:cancelButton];
    
    self.descriptonInputAccessoryView = inputAccessoryView;
}

- (void)getFiatAtTime
{
    [app.wallet getFiatAtTime:self.transaction.time * MSEC_PER_SEC value:imaxabs(self.transaction.amount) currencyCode:[app.latestResponse.symbol_local.code lowercaseString]];
    self.isGettingFiatAtTime = YES;
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(reloadDataAfterGetFiatAtTime) name:NOTIFICATION_KEY_GET_FIAT_AT_TIME object:nil];
}

- (NSString *)getNotePlaceholder
{
    NSString *label = [app.wallet getNotePlaceholderForTransaction:self.transaction filter:app.filterIndex];
    return label.length > 0 ? label : nil;
}

- (void)endEditing
{
    [self.textView resignFirstResponder];
    [self.tableView reloadRowsAtIndexPaths:@[[NSIndexPath indexPathForRow:cellRowDescription inSection:0]] withRowAnimation:UITableViewRowAnimationNone];
}

- (void)saveNote
{
    [self.textView resignFirstResponder];
    
    [self.busyViewDelegate showBusyViewWithLoadingText:BC_STRING_LOADING_SYNCING_WALLET];
    
    [app.wallet saveNote:self.textView.text forTransaction:self.transaction.myHash];
    
    [[NSNotificationCenter defaultCenter] addObserver:self selector:@selector(getHistoryAfterSavingNote) name:NOTIFICATION_KEY_BACKUP_SUCCESS object:nil];
}

- (void)getHistoryAfterSavingNote
{
    [[NSNotificationCenter defaultCenter] removeObserver:self name:NOTIFICATION_KEY_BACKUP_SUCCESS object:nil];
    [app.wallet getHistory];
}

- (void)didGetHistory
{
    if (self.isGettingFiatAtTime) return; // Multiple calls to didGetHistory will occur due to did_set_latest_block and did_multiaddr; prevent observer from being added twice
    [self getFiatAtTime];
}

- (void)reloadDataAfterGetFiatAtTime
{
    self.isGettingFiatAtTime = NO;
    [[NSNotificationCenter defaultCenter] removeObserver:self name:NOTIFICATION_KEY_GET_FIAT_AT_TIME object:nil];
    [self reloadData];
}

- (void)reloadData
{
    [self.busyViewDelegate hideBusyView];
    
    NSArray *newTransactions = app.latestResponse.transactions;
    Transaction *updatedTransaction = newTransactions[self.transactionIndex];
    
    if ([updatedTransaction.myHash isEqualToString:self.transaction.myHash]) {
        self.transaction = updatedTransaction;
    } else {
        BOOL didFindTransaction = NO;
        for (Transaction *transaction in newTransactions) {
            if ([transaction.myHash isEqualToString:self.transaction.myHash]) {
                self.transaction = updatedTransaction;
                didFindTransaction = YES;
                break;
            }
        }
        if (!didFindTransaction) {
            [self dismissViewControllerAnimated:YES completion:^{
                [app standardNotify:[NSString stringWithFormat:BC_STRING_COULD_NOT_FIND_TRANSACTION_ARGUMENT, self.transaction.myHash]];
            }];
        }
    }
    
    [self.tableView reloadData];
    
    if (self.refreshControl && self.refreshControl.isRefreshing) {
        [self.refreshControl endRefreshing];
    }
}

- (CGSize)addVerticalPaddingToSize:(CGSize)size
{
    return CGSizeMake(size.width, size.height + 16);
}

- (void)reloadSymbols
{
    [self.tableView reloadRowsAtIndexPaths:@[[NSIndexPath indexPathForRow:cellRowValue inSection:0]] withRowAnimation:UITableViewRowAnimationNone];
}

- (NSInteger)tableView:(UITableView *)tableView numberOfRowsInSection:(NSInteger)section
{
    return 6;
}

- (UITableViewCell *)tableView:(UITableView *)tableView cellForRowAtIndexPath:(NSIndexPath *)indexPath
{
    TransactionDetailTableCell *cell = (TransactionDetailTableCell *)[tableView dequeueReusableCellWithIdentifier:CELL_IDENTIFIER_TRANSACTION_DETAIL forIndexPath:indexPath];
    cell.selectionStyle = UITableViewCellSelectionStyleNone;
    cell.detailViewDelegate = self;
    cell.clipsToBounds = YES;
    
    if (indexPath.row == cellRowValue) {
        [cell configureValueCell:self.transaction];
    } else if (indexPath.row == cellRowDescription) {
        // Set initial height for sizeThatFits: calculation
        cell.frame = CGRectMake(cell.frame.origin.x, cell.frame.origin.y, cell.frame.size.width, cell.frame.size.height < rowHeightDefault ? rowHeightDefault : cell.frame.size.height);
        
        [cell configureDescriptionCell:self.transaction];
        
        self.oldTextViewHeight = cell.textView.frame.size.height;
        self.textView = cell.textView;
        cell.textView.inputAccessoryView = self.descriptonInputAccessoryView;
        
        // Resize textView in case current note is larger than one line
        [self textViewDidChange:self.textView];
        
    } else if (indexPath.row == cellRowTo) {
        [cell configureToCell:self.transaction];
    } else if (indexPath.row == cellRowFrom) {
        [cell configureFromCell:self.transaction];
    } else if (indexPath.row == cellRowDate) {
        [cell configureDateCell:self.transaction];
    } else if (indexPath.row == cellRowStatus) {
        [cell configureStatusCell:self.transaction];
    }
    return cell;
}

- (void)tableView:(UITableView *)tableView didSelectRowAtIndexPath:(NSIndexPath *)indexPath
{
    if (indexPath.row == cellRowTo && self.transaction.to.count > 1) {
        [tableView deselectRowAtIndexPath:indexPath animated:YES];
        [self showRecipients];
        return;
    }
    
    [tableView deselectRowAtIndexPath:indexPath animated:NO];
}

- (CGFloat)tableView:(UITableView *)tableView heightForRowAtIndexPath:(NSIndexPath *)indexPath
{
    if (indexPath.row == cellRowValue) {
        return rowHeightValue;
    } else if (indexPath.row == cellRowDescription && self.textView.text) {
        CGSize size = [self.textView sizeThatFits:CGSizeMake(self.textView.frame.size.width, FLT_MAX)];
        CGSize sizeToUse = [self addVerticalPaddingToSize:size];
        return sizeToUse.height < rowHeightDefault ? rowHeightDefault : sizeToUse.height;
    } else if (indexPath.row == cellRowTo) {
        return rowHeightDefault;
    } else if (indexPath.row == cellRowFrom) {
        return rowHeightDefault/2 + 20.5/2;
    }
    return rowHeightDefault;
}

- (void)tableView:(UITableView *)tableView willDisplayCell:(UITableViewCell *)cell forRowAtIndexPath:(NSIndexPath *)indexPath
{
    if (indexPath.row == cellRowTo) {
        [cell setSeparatorInset:UIEdgeInsetsMake(0, 15, 0, CGRectGetWidth(cell.bounds)-15)];
    }
}

- (void)showRecipients
{
    TransactionRecipientsViewController *recipientsViewController = [[TransactionRecipientsViewController alloc] initWithRecipients:self.transaction.to];
    recipientsViewController.delegate = self;
    [self.navigationController pushViewController:recipientsViewController animated:YES];
}

- (void)setupPullToRefresh
{
    // Tricky way to get the refreshController to work on a UIViewController - @see http://stackoverflow.com/a/12502450/2076094
    UITableViewController *tableViewController = [[UITableViewController alloc] init];
    tableViewController.tableView = self.tableView;
    self.refreshControl = [[UIRefreshControl alloc] init];
    [self.refreshControl setTintColor:[UIColor grayColor]];
    [self.refreshControl addTarget:self
                       action:@selector(refreshControlActivated)
             forControlEvents:UIControlEventValueChanged];
    tableViewController.refreshControl = self.refreshControl;
}

- (void)refreshControlActivated
{
    [self.busyViewDelegate showBusyViewWithLoadingText:BC_STRING_LOADING_LOADING_TRANSACTIONS];
    [app.wallet performSelector:@selector(getHistory) withObject:nil afterDelay:0.1f];
}

#pragma mark - Detail Delegate

- (void)toggleSymbol
{
    [app toggleSymbol];
    [self.tableView reloadRowsAtIndexPaths:@[[NSIndexPath indexPathForRow:cellRowValue inSection:0]] withRowAnimation:UITableViewRowAnimationNone];
}

- (void)textViewDidChange:(UITextView *)textView
{
    CGSize size = [self.textView sizeThatFits:CGSizeMake(self.textView.frame.size.width, FLT_MAX)];
    if (size.height != self.oldTextViewHeight) {
        self.oldTextViewHeight = size.height;
        self.textView.frame = CGRectMake(self.textView.frame.origin.x, self.textView.frame.origin.y, self.textView.frame.size.width, size.height);
        [UIView setAnimationsEnabled:NO];
        [self.tableView beginUpdates];
        [self.tableView endUpdates];
        [UIView setAnimationsEnabled:YES];
    }
}

- (void)showWebviewDetail
{
    BCWebViewController *webViewController = [[BCWebViewController alloc] initWithTitle:BC_STRING_DETAILS];
    [webViewController loadURL:[URL_SERVER stringByAppendingFormat:@"/tx/%@", self.transaction.myHash]];
    webViewController.modalTransitionStyle = UIModalTransitionStyleCoverVertical;
    [self presentViewController:webViewController animated:YES completion:nil];
}

- (NSString *)getCurrencyCode
{
    return [app.latestResponse.symbol_local.code lowercaseString];
}

#pragma mark - Recipients Delegate

- (BOOL)isWatchOnlyLegacyAddress:(NSString *)addr
{
    return [app.wallet isWatchOnlyLegacyAddress:addr];
}

@end
